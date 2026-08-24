import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentData, FirestoreService } from '../common/firestore/firestore.service';
import { DEFAULT_TIMEZONE, dateKey, daysUntil } from '../zalo/zalo-time';

/** One page of tasks; the console filters rather than scrolls a whole database. */
const TASK_PAGE_SIZE = 200;

const STATUSES = ['Icebox', 'Backlog', 'On Going', 'Waiting for Review', 'Done'] as const;

export interface TaskQuery {
  boardId?: string;
  status?: string;
  assignee?: string;
  overdue?: boolean;
  search?: string;
}

/**
 * Read models for the admin console.
 *
 * Firestore is queried whole and joined in memory, the same way the rest of this
 * app does it: the collections are small, and it keeps the console independent
 * of any index configuration.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly config: ConfigService,
  ) {}

  private get timezone(): string {
    return this.config.get<string>('ZALO_TIMEZONE') || DEFAULT_TIMEZONE;
  }

  private async everything(): Promise<{
    users: DocumentData[];
    boards: DocumentData[];
    cards: DocumentData[];
    tasks: DocumentData[];
  }> {
    const [users, boards, cards, tasks] = await Promise.all([
      this.firestore.find('users'),
      this.firestore.find('boards'),
      this.firestore.find('cards'),
      this.firestore.find('tasks'),
    ]);
    return { users, boards, cards, tasks };
  }

  private isOverdue(task: DocumentData, now: Date): boolean {
    if (!task.dueDate || task.status === 'Done') return false;
    const days = daysUntil(task.dueDate, this.timezone, now);
    return days !== null && days < 0;
  }

  /** Headline numbers for the top of the console. */
  async overview() {
    const now = new Date();
    const today = dateKey(now, this.timezone);
    const { users, boards, cards, tasks } = await this.everything();

    const byStatus: Record<string, number> = {};
    for (const status of STATUSES) byStatus[status] = 0;

    let overdue = 0;
    let createdToday = 0;
    let completedToday = 0;
    let unassigned = 0;

    for (const task of tasks) {
      const status = (STATUSES as readonly string[]).includes(task.status)
        ? task.status
        : task.status
          ? 'Khác'
          : 'Icebox';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (this.isOverdue(task, now)) overdue++;
      if (task.createdAt && dateKey(new Date(task.createdAt), this.timezone) === today) {
        createdToday++;
      }
      if (task.completedAt && dateKey(new Date(task.completedAt), this.timezone) === today) {
        completedToday++;
      }
      if (!(task.assignedMembers || []).length && task.status !== 'Done') unassigned++;
    }

    const done = byStatus['Done'] || 0;
    return {
      counts: {
        users: users.length,
        boards: boards.length,
        cards: cards.length,
        tasks: tasks.length,
      },
      progress: {
        done,
        percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        overdue,
        unassigned,
      },
      today: { created: createdToday, completed: completedToday },
      byStatus,
      timezone: this.timezone,
    };
  }

  /** Everyone who has signed in, with how much work they carry. */
  async users() {
    const now = new Date();
    const { users, boards, tasks } = await this.everything();

    return users
      .map((user) => {
        const own = tasks.filter((task) => (task.assignedMembers || []).includes(user.id));
        const openTasks = own.filter((task) => task.status !== 'Done');
        return {
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl || null,
          createdAt: user.createdAt || null,
          // GitHub accounts have no password flow, so this explains "no code sent"
          provider: user.githubId ? 'github' : 'email',
          boards: boards.filter(
            (board) => board.ownerId === user.id || (board.members || []).includes(user.id),
          ).length,
          openTasks: openTasks.length,
          overdue: openTasks.filter((task) => this.isOverdue(task, now)).length,
        };
      })
      .sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name));
  }

  /** Every board with its progress, busiest first. */
  async boards() {
    const now = new Date();
    const { users, boards, cards, tasks } = await this.everything();
    const names = new Map(users.map((user) => [user.id, user.name || user.email]));

    return boards
      .map((board) => {
        const own = tasks.filter((task) => task.boardId === board.id);
        const done = own.filter((task) => task.status === 'Done').length;
        return {
          id: board.id,
          name: board.name || board.id,
          description: board.description || '',
          owner: names.get(board.ownerId) || this.missingUser(board.ownerId),
          members: (board.members || []).length,
          cards: cards.filter((card) => card.boardId === board.id).length,
          tasks: own.length,
          done,
          percent: own.length ? Math.round((done / own.length) * 100) : 0,
          overdue: own.filter((task) => this.isOverdue(task, now)).length,
          createdAt: board.createdAt || null,
        };
      })
      .sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
  }

  /** Filtered task list, newest deadlines and worst delays first. */
  async tasks(query: TaskQuery) {
    const now = new Date();
    const { users, boards, tasks } = await this.everything();
    const names = new Map(users.map((user) => [user.id, user.name || user.email]));
    const boardNames = new Map(boards.map((board) => [board.id, board.name || board.id]));
    const search = (query.search || '').trim().toLowerCase();

    const matching = tasks.filter((task) => {
      if (query.boardId && task.boardId !== query.boardId) return false;
      if (query.status && (task.status || 'Icebox') !== query.status) return false;
      if (query.assignee && !(task.assignedMembers || []).includes(query.assignee)) return false;
      if (query.overdue && !this.isOverdue(task, now)) return false;
      if (
        search &&
        !String(task.title || '')
          .toLowerCase()
          .includes(search)
      )
        return false;
      return true;
    });

    const rows = matching
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status || 'Icebox',
        board: boardNames.get(task.boardId) || task.boardId,
        boardId: task.boardId,
        dueDate: task.dueDate || null,
        overdue: this.isOverdue(task, now),
        assignees: (task.assignedMembers || []).map(
          (id: string) => names.get(id) || this.missingUser(id),
        ),
        comments: (task.comments || []).length,
        attachments: (task.attachments || []).length,
        createdAt: task.createdAt || null,
        completedAt: task.completedAt || null,
      }))
      // Overdue first, then by deadline; tasks without one sink to the bottom.
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return a.dueDate ? -1 : b.dueDate ? 1 : a.title.localeCompare(b.title);
      });

    return { total: rows.length, rows: rows.slice(0, TASK_PAGE_SIZE) };
  }

  /**
   * Boards and tasks can outlive the account they point at. The console keeps a
   * fragment of the id, which is what makes such a leftover traceable.
   */
  private missingUser(id: string): string {
    return `Không rõ (${String(id).slice(0, 6)}…)`;
  }

  async deleteTask(id: string): Promise<{ deleted: string }> {
    const task = await this.firestore.findById('tasks', id);
    if (!task) throw new NotFoundException('Task not found');
    await this.firestore.delete('tasks', id);
    return { deleted: id };
  }

  /**
   * Deletes a board with everything under it. Without the cascade the cards and
   * tasks would stay in Firestore forever, invisible but still counted.
   */
  async deleteBoard(id: string): Promise<{ deleted: string; cards: number; tasks: number }> {
    const board = await this.firestore.findById('boards', id);
    if (!board) throw new NotFoundException('Board not found');

    const [cards, tasks] = await Promise.all([
      this.firestore.find('cards', (card) => card.boardId === id),
      this.firestore.find('tasks', (task) => task.boardId === id),
    ]);

    await Promise.all([
      ...tasks.map((task) => this.firestore.delete('tasks', task.id)),
      ...cards.map((card) => this.firestore.delete('cards', card.id)),
    ]);
    await this.firestore.delete('boards', id);

    return { deleted: id, cards: cards.length, tasks: tasks.length };
  }
}
