import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentData, FirestoreService } from '../common/firestore/firestore.service';
import { ZaloService } from './zalo.service';
import { DEFAULT_TIMEZONE, formatDayMonth, formatTime } from './zalo-time';

/** How long activity is collected before one combined message goes out. */
const DEFAULT_BATCH_MS = 15_000;

/** A busy board should not produce an endless message; flush early instead. */
const MAX_LINES_PER_MESSAGE = 25;

interface BoardQueue {
  lines: string[];
  timer: NodeJS.Timeout;
}

/**
 * The "assistant" half of the integration: turns board activity into a short
 * Vietnamese summary in the Zalo group.
 *
 * Every entry point is fire-and-forget - callers do not await it and it never
 * throws, because a chat notification must not be able to fail an API request
 * that already succeeded. Activity is batched per board so that dragging five
 * cards in a row produces one message rather than five.
 */
@Injectable()
export class ZaloNotifierService implements OnModuleDestroy {
  private readonly logger = new Logger(ZaloNotifierService.name);
  private readonly queues = new Map<string, BoardQueue>();
  private readonly names = new Map<string, string>();

  constructor(
    private readonly zalo: ZaloService,
    private readonly firestore: FirestoreService,
    private readonly config: ConfigService,
  ) {}

  onModuleDestroy(): void {
    // Deliver whatever is still queued instead of dropping it on shutdown.
    for (const boardId of [...this.queues.keys()]) {
      void this.flush(boardId);
    }
  }

  private get timezone(): string {
    return this.config.get<string>('ZALO_TIMEZONE') || DEFAULT_TIMEZONE;
  }

  private get batchMs(): number {
    const raw = this.config.get<string>('ZALO_BATCH_MS');
    if (raw === undefined || raw === '') return DEFAULT_BATCH_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BATCH_MS;
  }

  // ---- Entry points, one per kind of board activity ----

  taskCreated(boardId: string, actorId: string | undefined, task: DocumentData): void {
    void this.push(boardId, actorId, (who) =>
      Promise.resolve([
        `➕ ${who} đã tạo công việc "${task.title}" (${task.status || 'Icebox'})` +
          (task.dueDate ? ` – hạn ${this.shortDate(task.dueDate)}` : ''),
      ]),
    );
  }

  taskUpdated(
    boardId: string,
    actorId: string | undefined,
    before: DocumentData,
    after: DocumentData,
  ): void {
    void this.push(boardId, actorId, async (who) => {
      const lines: string[] = [];
      const title = after.title || before.title;

      if (before.title !== after.title) {
        lines.push(`✏️ ${who} đã đổi tên "${before.title}" → "${after.title}"`);
      }
      if ((before.status || 'Icebox') !== (after.status || 'Icebox')) {
        const done = (after.status || '') === 'Done';
        lines.push(
          `${done ? '✅' : '🔄'} ${who} đã chuyển "${title}": ` +
            `${before.status || 'Icebox'} → ${after.status || 'Icebox'}`,
        );
      }
      if ((before.dueDate || null) !== (after.dueDate || null)) {
        lines.push(
          after.dueDate
            ? `📅 ${who} đặt hạn cho "${title}": ${this.shortDate(after.dueDate)}`
            : `📅 ${who} đã bỏ hạn của "${title}"`,
        );
      }
      if ((before.description || '') !== (after.description || '')) {
        lines.push(`📝 ${who} đã sửa mô tả "${title}"`);
      }

      const previous: string[] = before.assignedMembers || [];
      const current: string[] = after.assignedMembers || [];
      const added = await this.namesOf(current.filter((id) => !previous.includes(id)));
      const removed = await this.namesOf(previous.filter((id) => !current.includes(id)));
      if (added.length) lines.push(`👤 ${who} đã giao "${title}" cho ${added.join(', ')}`);
      if (removed.length) lines.push(`🚫 ${who} đã gỡ ${removed.join(', ')} khỏi "${title}"`);

      // A pure column drag changes only cardId; still worth reporting.
      if (!lines.length && before.cardId !== after.cardId) {
        lines.push(`↔️ ${who} đã di chuyển "${title}" sang danh sách khác`);
      }
      return lines;
    });
  }

  taskDeleted(boardId: string, actorId: string | undefined, task: DocumentData): void {
    void this.push(boardId, actorId, (who) =>
      Promise.resolve([`🗑️ ${who} đã xoá công việc "${task.title}"`]),
    );
  }

  memberAssigned(
    boardId: string,
    actorId: string | undefined,
    task: DocumentData,
    memberId: string,
  ): void {
    void this.push(boardId, actorId, async (who) => [
      `👤 ${who} đã giao "${task.title}" cho ${await this.nameOf(memberId)}`,
    ]);
  }

  memberUnassigned(
    boardId: string,
    actorId: string | undefined,
    task: DocumentData,
    memberId: string,
  ): void {
    void this.push(boardId, actorId, async (who) => [
      `🚫 ${who} đã gỡ ${await this.nameOf(memberId)} khỏi "${task.title}"`,
    ]);
  }

  commentAdded(
    boardId: string,
    actorId: string | undefined,
    task: DocumentData,
    text: string,
  ): void {
    const excerpt = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    void this.push(boardId, actorId, (who) =>
      Promise.resolve([`💬 ${who} bình luận "${task.title}": ${excerpt}`]),
    );
  }

  attachmentAdded(
    boardId: string,
    actorId: string | undefined,
    task: DocumentData,
    fileName: string,
  ): void {
    void this.push(boardId, actorId, (who) =>
      Promise.resolve([`📎 ${who} đã đính kèm ${fileName} vào "${task.title}"`]),
    );
  }

  // ---- Queueing ----

  private async push(
    boardId: string,
    actorId: string | undefined,
    build: (who: string) => Promise<string[]>,
  ): Promise<void> {
    if (!this.zalo.isConfigured) return;

    try {
      const who = await this.nameOf(actorId);
      const stamp = formatTime(new Date(), this.timezone);
      const lines = (await build(who)).map((line) => `• ${stamp} ${line}`);
      if (!lines.length) return;

      const queue = this.queues.get(boardId);
      if (queue) {
        queue.lines.push(...lines);
        if (queue.lines.length >= MAX_LINES_PER_MESSAGE) {
          await this.flush(boardId);
        }
        return;
      }

      this.queues.set(boardId, {
        lines,
        timer: setTimeout(() => void this.flush(boardId), this.batchMs),
      });
    } catch (error: any) {
      this.logger.error(`Could not queue Zalo notification: ${error.message}`);
    }
  }

  private async flush(boardId: string): Promise<void> {
    const queue = this.queues.get(boardId);
    if (!queue) return;
    this.queues.delete(boardId);
    clearTimeout(queue.timer);

    try {
      const board = await this.firestore.findById('boards', boardId);
      const header =
        queue.lines.length > 1
          ? `🔔 Bảng "${board?.name || boardId}" – ${queue.lines.length} cập nhật`
          : `🔔 Bảng "${board?.name || boardId}"`;
      await this.zalo.sendMessage([header, ...queue.lines].join('\n'));
    } catch (error: any) {
      // Losing a notification is acceptable; breaking the request that caused it is not.
      this.logger.error(`Could not send Zalo notification: ${error.message}`);
    }
  }

  // ---- Lookups ----

  /** Display name for a user id, cached for the lifetime of the process. */
  private async nameOf(userId: string | undefined): Promise<string> {
    if (!userId) return 'Ai đó';
    const cached = this.names.get(userId);
    if (cached) return cached;

    const user = await this.firestore.findById('users', userId);
    // Boards keep pointing at people whose account is gone; a raw document id
    // in a chat message reads as a bug, so say plainly that it is unknown.
    const name = user?.name || user?.email || 'Người dùng đã xoá';
    this.names.set(userId, name);
    return name;
  }

  private namesOf(userIds: string[]): Promise<string[]> {
    return Promise.all(userIds.map((id) => this.nameOf(id)));
  }

  private shortDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return formatDayMonth(date, this.timezone);
  }
}
