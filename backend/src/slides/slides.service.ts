import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentData, FirestoreService } from '../common/firestore/firestore.service';
import { DeckOutline, DeckOutlineService } from './deck-outline.service';
import { SourceFile, SourceTextService } from './source-text.service';
import { DeckRequestDto, OutlineRequestDto } from './dto/slides.dto';
import { buildDeck } from './deck-builder';

/** One uploaded file, with the task and column it was uploaded to. */
export interface BoardSource {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string | null;
  taskId: string;
  taskTitle: string;
  cardId: string;
  cardName: string;
  /** False when the file's text cannot be read, e.g. an image or a .zip. */
  supported: boolean;
}

/**
 * The board's attachments, turned into a slide deck.
 *
 * Sources are always resolved from the board named in the URL, never from the
 * ids alone, so an attachment id from another board cannot be pulled into a
 * deck by a caller who only manages this one.
 */
@Injectable()
export class SlidesService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly sourceText: SourceTextService,
    private readonly outlines: DeckOutlineService,
  ) {}

  /** Every attachment on the board, newest first. */
  async listSources(boardId: string): Promise<BoardSource[]> {
    const [cards, tasks] = await Promise.all([
      this.firestore.find('cards', (card) => card.boardId === boardId),
      this.firestore.find('tasks', (task) => task.boardId === boardId),
    ]);

    const cardNames = new Map<string, string>(
      cards.map((card) => [card.id, String(card.name || card.title || 'Cột không tên')]),
    );

    const sources: BoardSource[] = [];
    for (const task of tasks) {
      for (const attachment of (task.attachments || []) as SourceFile[]) {
        if (!attachment?.id) continue;
        sources.push({
          id: String(attachment.id),
          name: String(attachment.name || attachment.id),
          type: String(attachment.type || ''),
          size: Number(attachment.size || 0),
          url: String(attachment.url || ''),
          uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
          taskId: String(task.id),
          taskTitle: String(task.title || 'Công việc không tên'),
          cardId: String(task.cardId || ''),
          cardName: cardNames.get(String(task.cardId)) || 'Không rõ cột',
          supported: this.sourceText.supports(attachment),
        });
      }
    }

    return sources.sort((a, b) =>
      String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')),
    );
  }

  /** True when GEMINI_API_KEY is set, i.e. slides are written rather than excerpted. */
  get modelAvailable(): boolean {
    return this.outlines.hasModel;
  }

  async buildOutline(
    board: DocumentData,
    dto: OutlineRequestDto,
  ): Promise<DeckOutline & { sources: { id: string; name: string }[] }> {
    const available = await this.listSources(board.id);
    const chosen = dto.sourceIds
      .map((id) => available.find((source) => source.id === id))
      .filter((source): source is BoardSource => Boolean(source));

    if (!chosen.length) {
      throw new BadRequestException('None of the chosen files belong to this board');
    }

    const extracted = await Promise.all(chosen.map((source) => this.sourceText.extract(source)));

    let outline: DeckOutline;
    try {
      outline = await this.outlines.build(extracted, {
        title: dto.title,
        slideCount: dto.slideCount,
        language: dto.language,
        audience: dto.audience,
        boardName: String(board.name || ''),
      });
    } catch (error: any) {
      // Unreadable sources are the caller's problem to fix (pick other files),
      // not a server fault.
      throw new BadRequestException(error.message);
    }

    return {
      ...outline,
      sources: extracted
        .filter((source) => source.text)
        .map((source) => ({ id: source.id, name: source.name })),
    };
  }

  /** Renders the reviewed outline. The slides arrive from the client, already edited. */
  async renderDeck(board: DocumentData, dto: DeckRequestDto): Promise<Buffer> {
    return buildDeck({
      title: dto.title,
      subtitle: dto.subtitle,
      slides: dto.slides.map((slide) => ({
        title: slide.title,
        bullets: slide.bullets || [],
        notes: slide.notes,
      })),
      sourceNames: dto.sourceNames,
      footer: board.name ? `Bảng "${String(board.name)}" · Lulu Trello` : 'Lulu Trello',
    });
  }

  /** A safe download name: no path separators, no characters Windows rejects. */
  fileName(title: string): string {
    const base =
      title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'lulu-deck';
    return `${base}.pptx`;
  }
}
