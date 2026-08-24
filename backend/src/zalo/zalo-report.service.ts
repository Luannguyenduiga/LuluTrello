import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentData, FirestoreService } from '../common/firestore/firestore.service';
import { ZaloService } from './zalo.service';
import {
  DEFAULT_TIMEZONE,
  dateKey,
  daysUntil,
  formatDate,
  msUntilNext,
  parseTimeOfDay,
} from './zalo-time';

/** Time of day the progress report goes out, unless ZALO_REPORT_TIME says otherwise. */
const DEFAULT_REPORT_TIME = '20:00';

/** Column names the board UI offers; anything else is counted under "Khác". */
const STATUSES = ['Icebox', 'Backlog', 'On Going', 'Waiting for Review', 'Done'] as const;

/** How far ahead a deadline still counts as "coming up" in the report. */
const UPCOMING_DAYS = 3;

/** Boards listed in full before the rest are rolled into one line. */
const DEFAULT_MAX_BOARDS = 10;

/** Deadlines named individually per board; the remainder is counted only. */
const MAX_NAMED_TASKS = 5;

interface BoardStats {
  board: DocumentData;
  total: number;
  byStatus: Record<string, number>;
  createdToday: number;
  completedToday: number;
  overdue: DocumentData[];
  upcoming: DocumentData[];
}

/**
 * The scheduled half of the integration: one progress digest per evening.
 *
 * The timer is plain setTimeout re-armed after every run rather than a cron
 * library, so the schedule needs no extra dependency and is computed in the
 * team's own timezone. `runNow()` is also exposed over HTTP so an external
 * scheduler can drive the report on hosts that idle the process (Render's free
 * tier sleeps, and a sleeping process has no timers).
 */
@Injectable()
export class ZaloReportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ZaloReportService.name);
  private timer: NodeJS.Timeout | null = null;
  private names = new Map<string, string>();

  constructor(
    private readonly zalo: ZaloService,
    private readonly firestore: FirestoreService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.zalo.hasToken) {
      this.logger.warn('No ZALO_TOKEN - the daily progress report is disabled.');
      return;
    }
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  get timezone(): string {
    return this.config.get<string>('ZALO_TIMEZONE') || DEFAULT_TIMEZONE;
  }

  get reportTime(): { hour: number; minute: number } {
    return parseTimeOfDay(this.config.get<string>('ZALO_REPORT_TIME'), DEFAULT_REPORT_TIME);
  }

  /** When the next automatic report is due, for /zalo/status. */
  get nextRunAt(): Date {
    const { hour, minute } = this.reportTime;
    return new Date(Date.now() + msUntilNext(hour, minute, this.timezone));
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    const { hour, minute } = this.reportTime;
    const delay = msUntilNext(hour, minute, this.timezone);

    this.timer = setTimeout(() => {
      void this.runNow()
        .catch((error: any) => this.logger.error(`Daily report failed: ${error.message}`))
        .finally(() => this.scheduleNext());
    }, delay);

    const at = new Date(Date.now() + delay).toISOString();
    this.logger.log(
      `Daily progress report scheduled for ${String(hour).padStart(2, '0')}:` +
        `${String(minute).padStart(2, '0')} ${this.timezone} (next run ${at}).`,
    );
  }

  /** Builds and sends the report immediately. Returns what was sent. */
  async runNow(): Promise<{ sent: boolean; text: string }> {
    const text = await this.buildReport();
    const sent = await this.zalo.sendMessage(text);
    if (sent) this.logger.log('Daily progress report sent to Zalo.');
    return { sent, text };
  }

  /** The report body - also useful on its own for previewing over HTTP. */
  async buildReport(now = new Date()): Promise<string> {
    const timezone = this.timezone;
    const [boards, tasks] = await Promise.all([
      this.firestore.find('boards'),
      this.firestore.find('tasks'),
    ]);

    const onlyBoards = (this.config.get<string>('ZALO_REPORT_BOARDS') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const today = dateKey(now, timezone);
    const stats = boards
      .filter((board) => !onlyBoards.length || onlyBoards.includes(board.id))
      .map((board) => this.statsFor(board, tasks, today, timezone, now))
      .filter((entry) => entry.total > 0)
      // Busiest boards first: today's activity, then how much is late.
      .sort(
        (a, b) =>
          b.createdToday + b.completedToday - (a.createdToday + a.completedToday) ||
          b.overdue.length - a.overdue.length ||
          b.total - a.total,
      );

    const header = `📊 BÁO CÁO TIẾN ĐỘ – ${formatDate(now, timezone)}`;
    if (!stats.length) {
      return `${header}\n\nChưa có công việc nào trong hệ thống.`;
    }

    const maxBoards =
      Number(this.config.get<string>('ZALO_REPORT_MAX_BOARDS')) || DEFAULT_MAX_BOARDS;
    const shown = stats.slice(0, maxBoards);
    const hidden = stats.slice(maxBoards);

    const sections = await Promise.all(
      shown.map((entry) => this.renderBoard(entry, timezone, now)),
    );
    if (hidden.length) {
      const hiddenTasks = hidden.reduce((sum, entry) => sum + entry.total, 0);
      sections.push(`… và ${hidden.length} bảng khác (${hiddenTasks} công việc).`);
    }

    return [header, '', ...sections, this.renderTotals(stats)].join('\n');
  }

  // ---- Aggregation ----

  private statsFor(
    board: DocumentData,
    tasks: DocumentData[],
    today: string,
    timezone: string,
    now: Date,
  ): BoardStats {
    const own = tasks.filter((task) => task.boardId === board.id);
    const byStatus: Record<string, number> = {};
    let createdToday = 0;
    let completedToday = 0;
    const overdue: DocumentData[] = [];
    const upcoming: DocumentData[] = [];

    for (const task of own) {
      const status = (STATUSES as readonly string[]).includes(task.status)
        ? task.status
        : task.status
          ? 'Khác'
          : 'Icebox';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (task.createdAt && dateKey(new Date(task.createdAt), timezone) === today) createdToday++;
      if (task.completedAt && dateKey(new Date(task.completedAt), timezone) === today) {
        completedToday++;
      }

      if (task.dueDate && status !== 'Done') {
        const days = daysUntil(task.dueDate, timezone, now);
        if (days === null) continue;
        if (days < 0) overdue.push(task);
        else if (days <= UPCOMING_DAYS) upcoming.push(task);
      }
    }

    const byDueDate = (a: DocumentData, b: DocumentData) => a.dueDate.localeCompare(b.dueDate);
    return {
      board,
      total: own.length,
      byStatus,
      createdToday,
      completedToday,
      overdue: overdue.sort(byDueDate),
      upcoming: upcoming.sort(byDueDate),
    };
  }

  // ---- Rendering ----

  private async renderBoard(entry: BoardStats, timezone: string, now: Date): Promise<string> {
    const done = entry.byStatus['Done'] || 0;
    const percent = Math.round((done / entry.total) * 100);
    const lines = [
      `🗂️ ${entry.board.name || entry.board.id}`,
      `   Tiến độ: ${done}/${entry.total} hoàn thành (${percent}%) ${this.bar(percent)}`,
    ];

    const flow = STATUSES.filter((status) => status !== 'Done')
      .concat('Khác' as any)
      .map((status) => ({ status, count: entry.byStatus[status] || 0 }))
      .filter((item) => item.count > 0)
      .map((item) => `${item.status} ${item.count}`)
      .join(' · ');
    if (flow) lines.push(`   Còn lại: ${flow}`);

    lines.push(`   Hôm nay: +${entry.createdToday} mới · ✅ ${entry.completedToday} hoàn thành`);

    if (entry.overdue.length) {
      lines.push(`   ⚠️ Quá hạn (${entry.overdue.length}):`);
      lines.push(...(await this.renderTasks(entry.overdue, timezone, now)));
    }
    if (entry.upcoming.length) {
      lines.push(`   ⏰ Sắp đến hạn trong ${UPCOMING_DAYS} ngày (${entry.upcoming.length}):`);
      lines.push(...(await this.renderTasks(entry.upcoming, timezone, now)));
    }
    if (!entry.overdue.length && !entry.upcoming.length) {
      lines.push('   👍 Không có công việc trễ hạn.');
    }

    return `${lines.join('\n')}\n`;
  }

  private async renderTasks(tasks: DocumentData[], timezone: string, now: Date): Promise<string[]> {
    const named = tasks.slice(0, MAX_NAMED_TASKS);
    const lines = await Promise.all(
      named.map(async (task) => {
        const days = daysUntil(task.dueDate, timezone, now) ?? 0;
        const when =
          days < 0 ? `trễ ${Math.abs(days)} ngày` : days === 0 ? 'hôm nay' : `còn ${days} ngày`;
        const owners = await this.namesOf(task.assignedMembers || []);
        const who = owners.length ? ` – ${owners.join(', ')}` : ' – chưa giao';
        return `      · "${task.title}" (${when}${who})`;
      }),
    );

    if (tasks.length > named.length) {
      lines.push(`      · … và ${tasks.length - named.length} công việc khác`);
    }
    return lines;
  }

  private renderTotals(stats: BoardStats[]): string {
    const total = stats.reduce((sum, entry) => sum + entry.total, 0);
    const done = stats.reduce((sum, entry) => sum + (entry.byStatus['Done'] || 0), 0);
    const overdue = stats.reduce((sum, entry) => sum + entry.overdue.length, 0);
    const created = stats.reduce((sum, entry) => sum + entry.createdToday, 0);
    const completed = stats.reduce((sum, entry) => sum + entry.completedToday, 0);
    const percent = total ? Math.round((done / total) * 100) : 0;

    return (
      `📈 TỔNG: ${stats.length} bảng · ${total} công việc · ${done} hoàn thành (${percent}%)\n` +
      `   Hôm nay: +${created} mới · ✅ ${completed} hoàn thành · ⚠️ ${overdue} quá hạn`
    );
  }

  private bar(percent: number): string {
    const filled = Math.round(percent / 10);
    return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
  }

  private async namesOf(userIds: string[]): Promise<string[]> {
    return Promise.all(
      userIds.map(async (id) => {
        const cached = this.names.get(id);
        if (cached) return cached;
        const user = await this.firestore.findById('users', id);
        const name = user?.name || user?.email || 'Người dùng đã xoá';
        this.names.set(id, name);
        return name;
      }),
    );
  }
}
