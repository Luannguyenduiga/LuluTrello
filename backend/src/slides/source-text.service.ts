import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { StorageService } from '../storage/storage.service';

/** A task attachment, as TasksController stores it on the task document. */
export interface SourceFile {
  id: string;
  name?: string;
  type?: string;
  /** R2 object key. Absent on attachments uploaded before R2 was introduced. */
  storageKey?: string;
  /** Legacy: the public /uploads URL of a file on the server's own disk. */
  url?: string;
  size?: number;
  uploadedAt?: string | null;
}

/** Kinds of attachment this service can turn into plain text. */
export type SourceKind = 'pdf' | 'docx' | 'text' | 'unsupported';

export interface ExtractedSource {
  id: string;
  name: string;
  /** Empty when the file could not be read; `error` then says why. */
  text: string;
  characters: number;
  truncated: boolean;
  error?: string;
}

/** Per-file ceiling, so one 300-page PDF cannot crowd out every other source. */
const MAX_CHARS_PER_SOURCE = 20_000;

/** Extensions read straight off disk as UTF-8. */
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json', 'log'];

/** Shape of the mammoth surface this service uses. */
interface MammothModule {
  extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
}

/** Shape of the pdf-parse v2 surface this service uses. */
interface PdfParseModule {
  PDFParse: new (options: { data: Uint8Array }) => {
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  };
}

/**
 * Reads the text out of the files uploaded as task attachments.
 *
 * Attachments live in R2 and are fetched by their object key. Records made
 * before that move point at a file on the server's own disk instead, and are
 * still read from there when it happens to still be present.
 */
@Injectable()
export class SourceTextService {
  private readonly logger = new Logger(SourceTextService.name);

  constructor(private readonly storage: StorageService) {}

  /** Where attachments landed before R2, and still do on an unconfigured server. */
  private get uploadDir(): string {
    return join(__dirname, '..', '..', 'uploads');
  }

  private extension(name: string): string {
    const parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  /** What we can do with a file, decided by its extension then its mime type. */
  kindOf(attachment: SourceFile): SourceKind {
    const extension = this.extension(attachment.name || '');
    if (extension === 'pdf') return 'pdf';
    if (extension === 'docx') return 'docx';
    if (TEXT_EXTENSIONS.includes(extension)) return 'text';

    const type = (attachment.type || '').toLowerCase();
    if (type === 'application/pdf') return 'pdf';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'docx';
    }
    if (type.startsWith('text/')) return 'text';

    return 'unsupported';
  }

  supports(attachment: SourceFile): boolean {
    return this.kindOf(attachment) !== 'unsupported';
  }

  /**
   * Never throws: a source that cannot be read comes back with an `error` and
   * empty text, so one bad file does not lose the whole deck.
   */
  async extract(attachment: SourceFile): Promise<ExtractedSource> {
    const name = attachment.name || attachment.id;
    const fail = (error: string): ExtractedSource => ({
      id: attachment.id,
      name,
      text: '',
      characters: 0,
      truncated: false,
      error,
    });

    const kind = this.kindOf(attachment);
    if (kind === 'unsupported') {
      return fail('This file type cannot be read (PDF, DOCX and text files are supported)');
    }

    let buffer: Buffer;
    try {
      const bytes = await this.bytes(attachment);
      if (!bytes) {
        return fail(
          'The file is no longer stored (attachments uploaded before the move to ' +
            'object storage were lost when the server restarted)',
        );
      }
      buffer = bytes;
    } catch (error: any) {
      return fail(`Could not fetch this file: ${error.message}`);
    }

    try {
      const raw = await this.read(kind, buffer);
      const clean = this.tidy(raw);
      if (!clean) return fail('No readable text was found in this file');

      const truncated = clean.length > MAX_CHARS_PER_SOURCE;
      return {
        id: attachment.id,
        name,
        text: truncated ? clean.slice(0, MAX_CHARS_PER_SOURCE) : clean,
        characters: clean.length,
        truncated,
      };
    } catch (error: any) {
      this.logger.warn(`Could not read "${name}": ${error.message}`);
      return fail(`Could not read this file: ${error.message}`);
    }
  }

  /** The file's bytes, or null when nothing is stored under this record. */
  private async bytes(attachment: SourceFile): Promise<Buffer | null> {
    if (attachment.storageKey) {
      if (!this.storage.enabled) throw new Error('object storage is not configured');
      return (await this.storage.head(attachment.storageKey))
        ? this.storage.get(attachment.storageKey)
        : null;
    }

    const filename = String(attachment.url || '')
      .split('/')
      .pop();
    if (!filename) return null;
    const path = join(this.uploadDir, filename);
    return existsSync(path) ? readFileSync(path) : null;
  }

  private async read(kind: Exclude<SourceKind, 'unsupported'>, buffer: Buffer): Promise<string> {
    if (kind === 'text') return buffer.toString('utf8');
    if (kind === 'docx') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as MammothModule;
      const result = await mammoth.extractRawText({ buffer });
      return result?.value || '';
    }

    // Required here rather than at the top of the file: pdf-parse pulls in pdfjs
    // and a native canvas binding, and a host missing that binding should still
    // start and serve every other route.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as PdfParseModule;
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }

  /**
   * PDF text arrives full of stray whitespace, plus the page markers pdf-parse
   * inserts between pages; both are collapsed before they cost tokens.
   */
  private tidy(text: string): string {
    return (
      text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        // pdf-parse marks each page boundary with a line like "-- 3 of 12 --";
        // that is pagination, not content the slides should quote.
        .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }
}
