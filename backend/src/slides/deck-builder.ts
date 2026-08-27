import PptxGenJS from 'pptxgenjs';
import { DeckSlide } from './deck-outline.service';

/**
 * The deck's palette, taken from the app's own accent colours so an exported
 * deck looks like it came from Lulu Trello.
 */
const BACKGROUND = '111827';
const SURFACE = '1F2937';
const ACCENT = '6366F1';
const ACCENT_ALT = 'EC4899';
const TEXT = 'F3F4F6';
const MUTED = 'A1A3A8';

/** Segoe UI carries Vietnamese diacritics on every Windows PowerPoint. */
const FONT = 'Segoe UI';

const CONTENT_MASTER = 'LULU_CONTENT';

export interface DeckInput {
  title: string;
  subtitle?: string;
  slides: DeckSlide[];
  /** Listed on the closing slide so the audience can trace every claim. */
  sourceNames?: string[];
  /** Shown under the title, e.g. the board the sources came from. */
  footer?: string;
}

/** Bullet text shrinks rather than overflowing the slide when a source is wordy. */
const bulletOptions = (count: number) => ({
  fontFace: FONT,
  fontSize: count > 4 ? 16 : 18,
  color: TEXT,
  lineSpacingMultiple: 1.3,
  fit: 'shrink' as const,
});

/** Builds the .pptx in memory and hands back the bytes; nothing touches disk. */
export async function buildDeck(deck: DeckInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.title;
  pptx.subject = deck.subtitle || deck.title;
  pptx.author = 'Lulu Trello';
  pptx.company = 'Lulu Trello';

  pptx.defineSlideMaster({
    title: CONTENT_MASTER,
    background: { color: BACKGROUND },
    objects: [
      // A thin accent rule along the top, and a matching one under the heading.
      { rect: { x: 0, y: 0, w: '100%', h: 0.09, fill: { color: ACCENT } } },
      { rect: { x: 0.6, y: 1.32, w: 1.1, h: 0.05, fill: { color: ACCENT_ALT } } },
    ],
    slideNumber: { x: 9.2, y: 5.15, color: MUTED, fontSize: 10, fontFace: FONT },
  });

  addTitleSlide(pptx, deck);
  for (const slide of deck.slides) addContentSlide(pptx, slide);
  if (deck.sourceNames?.length) addSourcesSlide(pptx, deck.sourceNames);

  // 'nodebuffer' is the Node output of the underlying JSZip writer.
  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

function addTitleSlide(pptx: PptxGenJS, deck: DeckInput): void {
  const slide = pptx.addSlide();
  slide.background = { color: BACKGROUND };

  // A wide accent band behind the title, standing in for the app's gradient.
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 1.75,
    w: 0.22,
    h: 1.9,
    fill: { color: ACCENT },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 3.65,
    w: 0.22,
    h: 0.5,
    fill: { color: ACCENT_ALT },
  });

  slide.addText(deck.title, {
    x: 0.75,
    y: 1.85,
    w: 8.6,
    h: 1.5,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: TEXT,
    valign: 'middle',
    fit: 'shrink',
  });

  if (deck.subtitle) {
    slide.addText(deck.subtitle, {
      x: 0.78,
      y: 3.4,
      w: 8.6,
      h: 0.6,
      fontFace: FONT,
      fontSize: 18,
      color: MUTED,
      fit: 'shrink',
    });
  }

  if (deck.footer) {
    slide.addText(deck.footer, {
      x: 0.78,
      y: 4.75,
      w: 8.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
    });
  }
}

function addContentSlide(pptx: PptxGenJS, slide: DeckSlide): void {
  const target = pptx.addSlide({ masterName: CONTENT_MASTER });

  target.addText(slide.title || ' ', {
    x: 0.6,
    y: 0.45,
    w: 8.8,
    h: 0.8,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: TEXT,
    valign: 'middle',
    fit: 'shrink',
  });

  if (slide.bullets.length) {
    target.addText(
      slide.bullets.map((text) => ({
        text,
        options: { bullet: { characterCode: '2022' }, breakLine: true },
      })),
      { x: 0.75, y: 1.65, w: 8.5, h: 3.2, ...bulletOptions(slide.bullets.length) },
    );
  } else {
    // A heading with nothing under it reads as a mistake; say so explicitly.
    target.addText('(chưa có nội dung)', {
      x: 0.75,
      y: 1.65,
      w: 8.5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      italic: true,
      color: MUTED,
    });
  }

  if (slide.notes) target.addNotes(slide.notes);
}

function addSourcesSlide(pptx: PptxGenJS, sourceNames: string[]): void {
  const slide = pptx.addSlide({ masterName: CONTENT_MASTER });

  slide.addText('Nguồn tài liệu', {
    x: 0.6,
    y: 0.45,
    w: 8.8,
    h: 0.8,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: TEXT,
    valign: 'middle',
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.62,
    y: 1.6,
    w: 8.76,
    h: Math.min(3.3, 0.45 * sourceNames.length + 0.5),
    fill: { color: SURFACE },
    line: { color: SURFACE },
    rectRadius: 0.08,
  });

  slide.addText(
    sourceNames.map((name) => ({
      text: name,
      options: { bullet: { characterCode: '2022' }, breakLine: true },
    })),
    {
      x: 0.9,
      y: 1.8,
      w: 8.2,
      h: Math.min(2.9, 0.45 * sourceNames.length + 0.2),
      fontFace: FONT,
      fontSize: 14,
      color: MUTED,
      lineSpacingMultiple: 1.4,
      fit: 'shrink',
    },
  );

  slide.addText('Nội dung slide được tổng hợp từ các tệp đính kèm trên bảng.', {
    x: 0.62,
    y: 4.75,
    w: 8.76,
    h: 0.4,
    fontFace: FONT,
    fontSize: 11,
    italic: true,
    color: MUTED,
  });
}
