import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentData, FirestoreService } from '../common/firestore/firestore.service';
import { ZaloReportService } from './zalo-report.service';
import { DEFAULT_TIMEZONE, dateKey, daysUntil, formatDayMonth } from './zalo-time';
import { zaloBoards } from './zalo-boards';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-2.5-flash still appears in the model list but Google refuses it for
// new API keys, pointing at this one instead. Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/** Gemini is asked for prose, not an essay; keep the group readable. */
const GEMINI_TIMEOUT_MS = 25_000;

/** Upper bound on the board data handed to Gemini as context. */
const MAX_CONTEXT_TASKS = 120;

/** How many tasks a single answer lists before it starts counting instead. */
const MAX_LISTED = 8;

interface Snapshot {
  boards: DocumentData[];
  tasks: DocumentData[];
  names: Map<string, string>;
}

/**
 * Answers questions asked in the Zalo group.
 *
 * Two layers, in this order:
 *  1. Questions about the boards themselves - progress, overdue work, who is on
 *     what - are answered straight from Firestore. These are the questions a
 *     team actually asks, they are free and they cannot hallucinate.
 *  2. Anything else goes to Gemini with the board data as context, if
 *     GEMINI_API_KEY is set. Without a key the bot says what it does understand
 *     rather than staying silent.
 */
@Injectable()
export class ZaloAssistantService {
  private readonly logger = new Logger(ZaloAssistantService.name);

  constructor(
    private readonly firestore: FirestoreService,
    private readonly config: ConfigService,
    private readonly report: ZaloReportService,
  ) {}

  private get timezone(): string {
    return this.config.get<string>('ZALO_TIMEZONE') || DEFAULT_TIMEZONE;
  }

  private get geminiKey(): string | null {
    return (this.config.get<string>('GEMINI_API_KEY') || '').trim() || null;
  }

  /** The reply for one question. Never throws - it answers with the problem. */
  async answer(question: string, asker?: string): Promise<string> {
    const text = question.trim();
    if (!text) return this.help();

    try {
      const intent = this.classify(text);
      if (intent === 'help') return this.help();

      const snapshot = await this.load();
      switch (intent) {
        case 'report':
          return await this.report.buildReport();
        case 'overdue':
          return this.renderOverdue(snapshot);
        case 'upcoming':
          return this.renderUpcoming(snapshot);
        case 'today':
          return this.renderToday(snapshot);
        case 'boards':
          return this.renderBoards(snapshot);
        case 'person':
          return await this.renderPerson(snapshot, text, asker);
        default:
          return await this.ask(text, snapshot, asker);
      }
    } catch (error: any) {
      this.logger.error(`Could not answer "${text}": ${error.message}`);
      return `😵 Mình chưa trả lời được câu này: ${error.message}`;
    }
  }

  // ---- Intent ----

  /** Accents are stripped so "qua han" and "quá hạn" match the same intent. */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  private classify(text: string): string {
    const t = this.normalize(text);
    const has = (...keys: string[]) => keys.some((key) => t.includes(key));

    if (has('help', 'giup gi', 'huong dan', 'lam duoc gi', 'chuc nang', 'biet gi')) return 'help';
    if (has('bao cao', 'tien do', 'tinh hinh', 'report', 'progress')) return 'report';
    if (has('qua han', 'tre han', 'bi tre', 'overdue', 'tre khong')) return 'overdue';
    if (has('sap den han', 'sap toi han', 'sap het han', 'deadline', 'den han')) return 'upcoming';
    // "hôm nay" on its own appears in questions that have nothing to do with
    // the boards ("thời tiết hôm nay"), so it only counts alongside work words.
    if (
      has('hom nay', 'today') &&
      has('gi moi', 'co gi', 'viec', 'task', 'xong', 'hoan thanh', 'lam duoc', 'tien do')
    ) {
      return 'today';
    }
    if (has('bang nao', 'danh sach bang', 'co bao nhieu bang', 'cac bang', 'list board'))
      return 'boards';
    if (has('cua ai', 'ai dang lam', 'ai lam', 'viec cua', 'task cua', 'cong viec cua', 'cua toi'))
      return 'person';
    return 'freeform';
  }

  private help(): string {
    return [
      '🤖 Mình là trợ lý LuluTrello. Tag mình rồi hỏi, ví dụ:',
      '• "báo cáo tiến độ" – bản tóm tắt như báo cáo 20:00',
      '• "có gì quá hạn không" – danh sách việc trễ hạn',
      '• "sắp đến hạn gì" – việc tới hạn trong 3 ngày',
      '• "hôm nay có gì mới" – việc tạo/xong trong ngày',
      '• "có những bảng nào" – danh sách bảng và số việc',
      '• "việc của Luân" – việc đang giao cho một người',
      this.geminiKey
        ? '• hoặc hỏi tự do bất cứ điều gì về công việc'
        : '• (hỏi tự do cần GEMINI_API_KEY, hiện chưa cấu hình)',
    ].join('\n');
  }

  // ---- Data ----

  /**
   * The bot answers only about boards whose owner opted them in. Anything else
   * never enters the snapshot, so no board summary, deadline list or Gemini
   * prompt can mention a board the group is not meant to know about.
   */
  private async load(): Promise<Snapshot> {
    const [allBoards, allTasks, users] = await Promise.all([
      this.firestore.find('boards'),
      this.firestore.find('tasks'),
      this.firestore.find('users'),
    ]);

    const boards = zaloBoards(allBoards);
    const watched = new Set(boards.map((board) => board.id));
    const tasks = allTasks.filter((task) => watched.has(task.boardId));

    const names = new Map<string, string>();
    for (const user of users) {
      names.set(user.id, user.name || user.email || user.id);
    }
    return { boards, tasks, names };
  }

  private boardName(snapshot: Snapshot, boardId: string): string {
    return snapshot.boards.find((board) => board.id === boardId)?.name || boardId;
  }

  private assignees(snapshot: Snapshot, task: DocumentData): string {
    const ids: string[] = task.assignedMembers || [];
    if (!ids.length) return 'chưa giao';
    return ids.map((id) => snapshot.names.get(id) || 'Người dùng đã xoá').join(', ');
  }

  private open(snapshot: Snapshot): DocumentData[] {
    return snapshot.tasks.filter((task) => task.status !== 'Done');
  }

  // ---- Board answers ----

  private renderOverdue(snapshot: Snapshot): string {
    const now = new Date();
    const late = this.open(snapshot)
      .filter((task) => task.dueDate && (daysUntil(task.dueDate, this.timezone, now) ?? 0) < 0)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

    if (!late.length) return '👍 Không có công việc nào quá hạn.';

    const lines = late.slice(0, MAX_LISTED).map((task) => {
      const days = Math.abs(daysUntil(task.dueDate, this.timezone, now) ?? 0);
      return `• "${task.title}" – trễ ${days} ngày (${this.boardName(snapshot, task.boardId)} – ${this.assignees(snapshot, task)})`;
    });
    if (late.length > MAX_LISTED) lines.push(`• … và ${late.length - MAX_LISTED} việc khác`);

    return [`⚠️ Có ${late.length} công việc quá hạn:`, ...lines].join('\n');
  }

  private renderUpcoming(snapshot: Snapshot): string {
    const now = new Date();
    const soon = this.open(snapshot)
      .map((task) => ({
        task,
        days: task.dueDate ? daysUntil(task.dueDate, this.timezone, now) : null,
      }))
      .filter((entry) => entry.days !== null && entry.days >= 0 && entry.days <= 3)
      .sort((a, b) => (a.days as number) - (b.days as number));

    if (!soon.length) return '😌 Ba ngày tới không có việc nào đến hạn.';

    const lines = soon.slice(0, MAX_LISTED).map(({ task, days }) => {
      const when = days === 0 ? 'hôm nay' : `còn ${days as number} ngày`;
      return `• "${task.title}" – ${when}, hạn ${formatDayMonth(new Date(task.dueDate), this.timezone)} (${this.assignees(snapshot, task)})`;
    });
    if (soon.length > MAX_LISTED) lines.push(`• … và ${soon.length - MAX_LISTED} việc khác`);

    return [`⏰ ${soon.length} công việc đến hạn trong 3 ngày tới:`, ...lines].join('\n');
  }

  private renderToday(snapshot: Snapshot): string {
    const today = dateKey(new Date(), this.timezone);
    const sameDay = (value?: string) =>
      Boolean(value) && dateKey(new Date(value!), this.timezone) === today;

    const created = snapshot.tasks.filter((task) => sameDay(task.createdAt));
    const done = snapshot.tasks.filter((task) => sameDay(task.completedAt));

    if (!created.length && !done.length)
      return '📭 Hôm nay chưa có việc nào được tạo hay hoàn thành.';

    const lines = [`📅 Hôm nay: +${created.length} việc mới · ✅ ${done.length} hoàn thành`];
    for (const task of done.slice(0, MAX_LISTED)) {
      lines.push(`• ✅ "${task.title}" (${this.boardName(snapshot, task.boardId)})`);
    }
    // A task created and finished on the same day is already on the ✅ list.
    const finished = new Set(done.map((task) => task.id));
    for (const task of created.filter((task) => !finished.has(task.id)).slice(0, MAX_LISTED)) {
      lines.push(`• ➕ "${task.title}" (${this.boardName(snapshot, task.boardId)})`);
    }
    return lines.join('\n');
  }

  private renderBoards(snapshot: Snapshot): string {
    if (!snapshot.boards.length) {
      return 'Chưa có bảng nào bật trợ lý Zalo. Chủ bảng bật trong Workspace Settings nhé.';
    }

    const lines = snapshot.boards.map((board) => {
      const own = snapshot.tasks.filter((task) => task.boardId === board.id);
      const done = own.filter((task) => task.status === 'Done').length;
      const percent = own.length ? Math.round((done / own.length) * 100) : 0;
      return `• ${board.name || board.id}: ${own.length} việc, xong ${done} (${percent}%)`;
    });
    return [`🗂️ Có ${snapshot.boards.length} bảng:`, ...lines].join('\n');
  }

  private async renderPerson(
    snapshot: Snapshot,
    question: string,
    asker?: string,
  ): Promise<string> {
    const target = this.findPerson(snapshot, question, asker);
    if (!target) {
      // "ai đang làm Fix login" asks about a task, not a person, so a named task
      // is answered before giving up on the question.
      const task = this.findTask(snapshot, question);
      if (task) {
        return (
          `📌 "${task.title}" – ${task.status || 'Icebox'}, phụ trách: ` +
          `${this.assignees(snapshot, task)} (${this.boardName(snapshot, task.boardId)})`
        );
      }
      return await this.ask(question, snapshot, asker);
    }

    const mine = this.open(snapshot).filter((task) =>
      (task.assignedMembers || []).includes(target.id),
    );
    if (!mine.length) return `${target.name} hiện không còn việc nào đang mở.`;

    const lines = mine.slice(0, MAX_LISTED).map((task) => {
      const due = task.dueDate
        ? `, hạn ${formatDayMonth(new Date(task.dueDate), this.timezone)}`
        : '';
      return `• "${task.title}" – ${task.status || 'Icebox'}${due} (${this.boardName(snapshot, task.boardId)})`;
    });
    if (mine.length > MAX_LISTED) lines.push(`• … và ${mine.length - MAX_LISTED} việc khác`);

    return [`👤 ${target.name} đang có ${mine.length} việc:`, ...lines].join('\n');
  }

  /**
   * Matches the longest known name that appears in the question. Vietnamese
   * names are shortened in conversation - "việc của Gia Bảo" for "Nguyễn Gia
   * Bảo" - so the trailing parts of a name are matched too, longest first, and
   * a fuller match always beats a shorter one.
   */
  private findPerson(
    snapshot: Snapshot,
    question: string,
    asker?: string,
  ): { id: string; name: string } | null {
    const asked = this.normalize(question);
    let best: { id: string; name: string; score: number } | null = null;

    for (const [id, name] of snapshot.names) {
      const words = this.normalize(name).split(/\s+/).filter(Boolean);
      for (let from = 0; from < words.length; from++) {
        const candidate = words.slice(from).join(' ');
        // A single syllable is too weak to identify anybody by itself.
        if (candidate.length < 3 || (words.length - from === 1 && candidate.length < 4)) continue;
        if (asked.includes(candidate) && (!best || candidate.length > best.score)) {
          best = { id, name, score: candidate.length };
        }
      }
    }
    if (best) return { id: best.id, name: best.name };

    // "việc của tôi" refers to whoever is asking, matched by their Zalo name.
    if (asker && /cua toi|cua minh|cua em/.test(asked)) {
      for (const [id, name] of snapshot.names) {
        if (this.normalize(name) === this.normalize(asker)) return { id, name };
      }
    }
    return null;
  }

  /** The longest task title mentioned in the question, if any. */
  private findTask(snapshot: Snapshot, question: string): DocumentData | null {
    const asked = this.normalize(question);
    let best: DocumentData | null = null;

    for (const task of snapshot.tasks) {
      const title = this.normalize(String(task.title || ''));
      if (title.length >= 3 && asked.includes(title)) {
        if (!best || title.length > this.normalize(String(best.title)).length) best = task;
      }
    }
    return best;
  }

  // ---- Gemini ----

  private async ask(question: string, snapshot: Snapshot, asker?: string): Promise<string> {
    const key = this.geminiKey;
    if (!key) {
      return [
        '🤔 Câu này mình chưa tự trả lời được (chưa cấu hình GEMINI_API_KEY).',
        '',
        this.help(),
      ].join('\n');
    }

    const model = this.config.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const body = (withThinkingConfig: boolean) =>
      JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                'Bạn là trợ lý quản lý công việc của nhóm, trả lời trong một nhóm chat Zalo. ' +
                'Trả lời bằng tiếng Việt, ngắn gọn, tối đa 6 dòng, không dùng markdown. ' +
                'Chỉ dựa vào dữ liệu công việc được cung cấp; nếu dữ liệu không có thông tin ' +
                'thì nói thẳng là không có, tuyệt đối không bịa ra công việc hay tên người. ' +
                'có thể trả lời thêm về chế độ thời tiết ' +
                'nếu những việc khác thì trả lời nghiềm khắc với câu"Anh làm việc hay anh chơi ? Tôi là trợ lí công việc không phải AI web !".',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Dữ liệu công việc hiện tại:\n${this.context(snapshot)}` },
              { text: `${asker || 'Một thành viên'} hỏi: ${question}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          // Generous, because a thinking model draws its reasoning from the same
          // budget and a tight cap truncates the answer mid-sentence.
          maxOutputTokens: 1500,
          // Gemini 3 reasons before answering; keeping that short is what makes a
          // chat reply arrive quickly. Older models reject the field, hence the
          // retry below.
          ...(withThinkingConfig ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      });

    let response = await this.callGemini(model, key, body(true));
    if (response.status === 400) {
      response = await this.callGemini(model, key, body(false));
    }
    if (!response.ok) {
      throw new Error(`Gemini ${response.status}: ${response.text.slice(0, 200)}`);
    }

    const parsed = JSON.parse(response.text);
    const answer: string = (parsed?.candidates?.[0]?.content?.parts || [])
      // Thought parts are the model reasoning with itself; only the answer is
      // meant for the group.
      .filter((part: any) => part?.thought !== true)
      .map((part: any) => part?.text || '')
      .join('')
      .trim();

    return answer || 'Mình chưa nghĩ ra câu trả lời cho câu này.';
  }

  private async callGemini(
    model: string,
    key: string,
    payload: string,
  ): Promise<{ ok: boolean; status: number; text: string }> {
    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }

  /** Board data as compact lines - cheaper and clearer for the model than JSON. */
  private context(snapshot: Snapshot): string {
    const now = new Date();
    const lines: string[] = [];

    for (const board of snapshot.boards) {
      const own = snapshot.tasks.filter((task) => task.boardId === board.id);
      if (!own.length) continue;
      lines.push(`Bảng "${board.name || board.id}" (${own.length} việc):`);

      for (const task of own.slice(0, MAX_CONTEXT_TASKS)) {
        const due = task.dueDate
          ? `, hạn ${formatDayMonth(new Date(task.dueDate), this.timezone)}` +
            ((daysUntil(task.dueDate, this.timezone, now) ?? 0) < 0 && task.status !== 'Done'
              ? ' (quá hạn)'
              : '')
          : '';
        lines.push(
          `- "${task.title}" [${task.status || 'Icebox'}]${due}, phụ trách: ${this.assignees(snapshot, task)}`,
        );
      }
      if (own.length > MAX_CONTEXT_TASKS) {
        lines.push(`- … và ${own.length - MAX_CONTEXT_TASKS} việc khác không liệt kê`);
      }
    }

    return lines.length ? lines.join('\n') : 'Chưa có công việc nào.';
  }
}
