import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/** A task attachment, as TasksController stores it on the task document. */
export interface PreviewFile {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  size?: number;
}

/**
 * How the SPA should show the file.
 *
 * 'html' carries a complete, self-contained document the client drops into a
 * sandboxed iframe; the media kinds carry a URL the browser renders natively.
 */
export type PreviewKind = 'html' | 'pdf' | 'image' | 'video' | 'audio' | 'unsupported';

export interface Preview {
  id: string;
  name: string;
  /** Lower-case extension, so the client can label the viewer. */
  format: string;
  kind: PreviewKind;
  /** Set when kind is 'html': a full document, already escaped. */
  html?: string;
  /** Set for pdf/image/video/audio: the file's public URL. */
  url?: string;
  /** Shown above the viewer - truncation warnings, or why there is no preview. */
  note?: string;
}

/** Converting something bigger than this in memory is not worth the RAM. */
const MAX_CONVERT_BYTES = 25 * 1024 * 1024;

/** Ceilings that keep one huge file from producing an unusable wall of HTML. */
const MAX_TEXT_CHARS = 200_000;
const MAX_SHEET_ROWS = 400;
const MAX_SHEET_COLS = 40;
const MAX_SLIDES = 150;
const MAX_ZIP_ENTRIES = 500;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'm4v', 'mov'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'];
const SHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'tsv'];
const WEB_EXTENSIONS = ['html', 'htm'];
const TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'log',
  'json',
  'xml',
  'yaml',
  'yml',
  'ini',
  'env',
  'sql',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'bat',
  'ps1',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
];

/** Formats whose only real reader is the app that made them; we say so rather than guess. */
const LEGACY_OFFICE: Record<string, string> = {
  doc: 'Word 97-2003 (.doc)',
  ppt: 'PowerPoint 97-2003 (.ppt)',
  pages: 'Apple Pages',
  key: 'Apple Keynote',
  numbers: 'Apple Numbers',
};

/** Shape of the mammoth surface this service uses. */
interface MammothModule {
  convertToHtml(input: { buffer: Buffer }): Promise<{ value: string }>;
}

/**
 * Turns a task attachment into something the browser can actually display.
 *
 * Browsers render PDFs, images and media on their own, but hand a .docx or
 * .xlsx straight to a tab and it just downloads. Those are converted here, on
 * the server, into a plain HTML document - no scripts, everything escaped - so
 * the client can show it inside a sandboxed iframe.
 */
@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  /** The directory TasksController writes attachments into. */
  private get uploadDir(): string {
    return join(__dirname, '..', '..', 'uploads');
  }

  private extension(name: string): string {
    const parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  /**
   * Never throws: a file that cannot be converted comes back as 'unsupported'
   * with a note, so the modal can still offer the download link.
   */
  async build(attachment: PreviewFile, baseUrl: string): Promise<Preview> {
    const name = attachment.name || attachment.id;
    const format = this.extension(name) || this.extension(attachment.url || '');
    const base: Preview = { id: attachment.id, name, format, kind: 'unsupported' };

    // The stored URL carries the host from whenever the file was uploaded; the
    // filename is the part that matters, and the caller's host is current.
    const filename = String(attachment.url || '')
      .split('/')
      .pop();
    if (!filename) {
      return { ...base, note: 'Tệp này không có bản lưu trên máy chủ.' };
    }

    const path = join(this.uploadDir, filename);
    if (!existsSync(path)) {
      // Uploads live on the server's disk, which most hosts wipe on redeploy.
      return {
        ...base,
        note: 'Tệp không còn trên máy chủ (có thể đã bị xoá khi deploy lại).',
      };
    }
    const url = `${baseUrl}/uploads/${filename}`;

    // Handed to the browser as-is: no conversion, so no size ceiling either.
    if (format === 'pdf' || this.mime(attachment) === 'application/pdf') {
      return { ...base, kind: 'pdf', url };
    }
    if (this.isKind(attachment, format, IMAGE_EXTENSIONS, 'image/')) {
      return { ...base, kind: 'image', url };
    }
    if (this.isKind(attachment, format, VIDEO_EXTENSIONS, 'video/')) {
      return { ...base, kind: 'video', url };
    }
    if (this.isKind(attachment, format, AUDIO_EXTENSIONS, 'audio/')) {
      return { ...base, kind: 'audio', url };
    }

    if (LEGACY_OFFICE[format]) {
      return {
        ...base,
        note: `${LEGACY_OFFICE[format]} không xem trực tiếp được. Hãy tải về, hoặc lưu lại thành .docx / .xlsx / .pptx rồi tải lên lại.`,
      };
    }

    const bytes = statSync(path).size;
    if (bytes > MAX_CONVERT_BYTES) {
      return {
        ...base,
        note: `Tệp ${(bytes / 1024 / 1024).toFixed(1)} MB, quá lớn để dựng bản xem trước. Hãy tải về để mở.`,
      };
    }

    try {
      return { ...base, ...(await this.convert(format, attachment, path)) };
    } catch (error: any) {
      this.logger.warn(`Could not preview "${name}": ${error.message}`);
      return { ...base, note: `Không dựng được bản xem trước: ${error.message}` };
    }
  }

  private mime(attachment: PreviewFile): string {
    return (attachment.type || '').toLowerCase();
  }

  /** Extension first, mime type as the fallback - uploads sometimes lack one. */
  private isKind(
    attachment: PreviewFile,
    format: string,
    extensions: string[],
    mimePrefix: string,
  ): boolean {
    return extensions.includes(format) || this.mime(attachment).startsWith(mimePrefix);
  }

  private async convert(
    format: string,
    attachment: PreviewFile,
    path: string,
  ): Promise<Partial<Preview>> {
    const mime = this.mime(attachment);

    if (format === 'docx' || mime.includes('wordprocessingml')) {
      return this.fromDocx(readFileSync(path));
    }
    if (format === 'pptx' || mime.includes('presentationml')) {
      return this.fromPptx(readFileSync(path));
    }
    if (
      SHEET_EXTENSIONS.includes(format) ||
      mime.includes('spreadsheetml') ||
      mime === 'text/csv'
    ) {
      return this.fromSheet(readFileSync(path));
    }
    if (WEB_EXTENSIONS.includes(format) || mime === 'text/html') {
      // Rendered as authored, but inside the client's sandboxed iframe: scripts,
      // forms and navigation are all blocked there.
      return {
        kind: 'html',
        html: readFileSync(path, 'utf8'),
        note: 'Trang HTML hiển thị trong khung cách ly - script và biểu mẫu bị chặn.',
      };
    }
    if (format === 'zip') {
      return this.fromZip(readFileSync(path));
    }
    if (TEXT_EXTENSIONS.includes(format) || mime.startsWith('text/')) {
      return this.fromText(readFileSync(path));
    }

    return {
      note: 'Định dạng này chưa xem trước được. Hãy tải tệp về để mở bằng ứng dụng phù hợp.',
    };
  }

  // ---- Converters ----

  private async fromDocx(buffer: Buffer): Promise<Partial<Preview>> {
    // Required lazily, like pdf-parse in SourceTextService: a host that cannot
    // load one of these converters should still serve every other route.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as MammothModule;
    const result = await mammoth.convertToHtml({ buffer });
    const body = result?.value?.trim();
    if (!body) return { note: 'Tài liệu này không có nội dung để hiển thị.' };
    return { kind: 'html', html: this.page(`<article class="paper">${body}</article>`) };
  }

  private async fromPptx(buffer: Buffer): Promise<Partial<Preview>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buffer);

    const slides: string[] = Object.keys(zip.files)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
      .sort((a, b) => this.slideNumber(a) - this.slideNumber(b));
    if (!slides.length) return { note: 'Không đọc được slide nào trong tệp này.' };

    const shown = slides.slice(0, MAX_SLIDES);
    const cards: string[] = [];
    for (const [index, entry] of shown.entries()) {
      const paragraphs = this.drawingText(await zip.file(entry)!.async('string'));
      const notesEntry = zip.file(`ppt/notesSlides/notesSlide${this.slideNumber(entry)}.xml`);
      // A notes part repeats the slide's own text plus its number; both are
      // dropped so the notes block shows only what the author added there.
      const notes = notesEntry
        ? this.drawingText(await notesEntry.async('string')).filter(
            (line) => !paragraphs.includes(line) && !/^\d+$/.test(line),
          )
        : [];

      const [title, ...rest] = paragraphs;
      cards.push(
        `<section class="slide">
  <div class="slide-index">Slide ${index + 1}</div>
  ${title ? `<h2>${this.escape(title)}</h2>` : '<p class="muted">(slide không có chữ)</p>'}
  ${rest.length ? `<ul>${rest.map((line) => `<li>${this.escape(line)}</li>`).join('')}</ul>` : ''}
  ${notes.length ? `<div class="notes"><b>Ghi chú</b>${notes.map((line) => `<p>${this.escape(line)}</p>`).join('')}</div>` : ''}
</section>`,
      );
    }

    const clipped =
      slides.length > shown.length
        ? ` Hiển thị ${shown.length}/${slides.length} slide đầu tiên.`
        : '';
    return {
      kind: 'html',
      html: this.page(cards.join('\n')),
      note: `Bản xem trước lấy phần chữ của từng slide; hình ảnh và bố cục gốc chỉ có khi mở bằng PowerPoint.${clipped}`,
    };
  }

  private fromSheet(buffer: Buffer): Partial<Preview> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    if (!workbook.SheetNames?.length) return { note: 'Không có bảng tính nào trong tệp này.' };

    let clipped = false;
    const sections = workbook.SheetNames.map((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      // raw:false so dates, percentages and currency arrive already formatted
      // the way the author set them up in the spreadsheet.
      // Typed as strings: raw:false hands back every cell already formatted.
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });
      if (!rows.length) {
        return `<section class="sheet"><h2>${this.escape(sheetName)}</h2><p class="muted">(trống)</p></section>`;
      }

      const shown = rows.slice(0, MAX_SHEET_ROWS);
      const widest = Math.max(...shown.map((row) => row.length), 1);
      const columns = Math.min(widest, MAX_SHEET_COLS);
      if (rows.length > shown.length || widest > columns) clipped = true;

      const head = Array.from(
        { length: columns },
        (_unused, column) => `<th>${XLSX.utils.encode_col(column)}</th>`,
      ).join('');
      const body = shown
        .map((row, index) => {
          const cells = Array.from(
            { length: columns },
            (_unused, column) => `<td>${this.escape(String(row[column] ?? ''))}</td>`,
          ).join('');
          return `<tr><th class="gutter">${index + 1}</th>${cells}</tr>`;
        })
        .join('');

      return `<section class="sheet">
  <h2>${this.escape(sheetName)}</h2>
  <div class="scroll"><table><thead><tr><th class="gutter"></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
</section>`;
    });

    return {
      kind: 'html',
      html: this.page(sections.join('\n')),
      note: clipped
        ? `Bảng lớn nên chỉ hiển thị ${MAX_SHEET_ROWS} dòng và ${MAX_SHEET_COLS} cột đầu của mỗi sheet.`
        : undefined,
    };
  }

  private async fromZip(buffer: Buffer): Promise<Partial<Preview>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files as Record<string, any>)
      .filter((entry: any) => !entry.dir)
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));

    const shown = entries.slice(0, MAX_ZIP_ENTRIES);
    const rows = shown
      .map(
        (entry: any) =>
          `<tr><td>${this.escape(String(entry.name))}</td><td class="right">${this.bytes(
            entry._data?.uncompressedSize ?? 0,
          )}</td></tr>`,
      )
      .join('');

    const clipped =
      entries.length > shown.length ? ` Hiển thị ${shown.length}/${entries.length} mục.` : '';
    return {
      kind: 'html',
      html: this.page(
        `<section class="sheet"><h2>${entries.length} tệp trong kho nén</h2>
  <div class="scroll"><table><thead><tr><th>Tên tệp</th><th class="right">Dung lượng</th></tr></thead><tbody>${rows}</tbody></table></div>
</section>`,
      ),
      note: `Chỉ xem được danh sách tệp bên trong; tải về để giải nén.${clipped}`,
    };
  }

  private fromText(buffer: Buffer): Partial<Preview> {
    const raw = buffer.toString('utf8');
    // A NUL byte in the first block means this is binary wearing a text-ish
    // extension; dumping it into a <pre> would only produce noise.
    if (raw.slice(0, 4096).includes('\0')) {
      return { note: 'Tệp này là dữ liệu nhị phân, không hiển thị dạng văn bản được.' };
    }

    const truncated = raw.length > MAX_TEXT_CHARS;
    const text = truncated ? raw.slice(0, MAX_TEXT_CHARS) : raw;
    return {
      kind: 'html',
      html: this.page(`<pre class="paper">${this.escape(text)}</pre>`),
      note: truncated
        ? `Tệp dài, chỉ hiển thị ${MAX_TEXT_CHARS.toLocaleString('vi-VN')} ký tự đầu.`
        : undefined,
    };
  }

  // ---- Helpers ----

  private slideNumber(entry: string): number {
    return Number(entry.match(/(\d+)\.xml$/)?.[1] || 0);
  }

  /**
   * Pulls the visible text out of an OOXML drawing part, one line per <a:p>.
   * Reading the runs directly beats a full XML parse here: slide bodies are
   * shallow, and everything else in the part is layout we would throw away.
   */
  private drawingText(xml: string): string[] {
    return xml
      .split('</a:p>')
      .map((paragraph) =>
        (paragraph.match(/<a:t>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g) || [])
          .map((token) => (token.startsWith('<a:br') ? ' ' : this.decodeXml(token.slice(5, -6))))
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);
  }

  private decodeXml(value: string): string {
    return (
      value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
        // Last, so a literal "&amp;lt;" in the document survives as "&lt;".
        .replace(/&amp;/g, '&')
    );
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private bytes(size: number): string {
    if (!size) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  /**
   * Wraps converted content in a standalone document. Documents sit on paper
   * white rather than the app's dark surface: a .docx author picked their
   * colours against white, and dark-inverting a table of black text is worse.
   */
  private page(body: string): string {
    return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 18px; background: #6b7280; color: #111827;
         font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
         font-size: 14px; line-height: 1.6; }
  .paper, .slide, .sheet { background: #fff; border-radius: 10px; padding: 28px 32px;
         box-shadow: 0 6px 22px rgba(0,0,0,0.28); margin: 0 auto 18px; max-width: 900px; }
  .paper { min-height: 200px; }
  pre.paper { white-space: pre-wrap; word-break: break-word; font-size: 13px;
         font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; line-height: 1.5; }
  h1, h2, h3, h4 { line-height: 1.3; margin: 1.2em 0 0.5em; }
  h1:first-child, h2:first-child { margin-top: 0; }
  p { margin: 0 0 0.8em; }
  img { max-width: 100%; height: auto; }
  a { color: #4338ca; }
  table { border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 5px 9px; text-align: left;
         vertical-align: top; white-space: pre-wrap; max-width: 320px; }
  thead th { background: #f3f4f6; color: #6b7280; font-weight: 600; text-align: center; }
  .gutter { background: #f3f4f6; color: #9ca3af; font-weight: 600; text-align: center;
         min-width: 34px; }
  .right { text-align: right; }
  /* Wide sheets scroll inside their own card instead of stretching the page. */
  .scroll { overflow-x: auto; }
  .sheet { max-width: min(1600px, 100%); box-sizing: border-box; }
  .slide-index { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
         color: #9ca3af; font-weight: 700; margin-bottom: 10px; }
  .slide h2 { margin: 0 0 12px; font-size: 22px; }
  .slide ul { margin: 0; padding-left: 20px; }
  .slide li { margin-bottom: 6px; }
  .notes { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #d1d5db;
         font-size: 12px; color: #6b7280; }
  .notes b { display: block; margin-bottom: 4px; }
  .notes p { margin: 0 0 4px; }
  .muted { color: #9ca3af; }
</style></head>
<body>
${body}
</body></html>`;
  }
}
