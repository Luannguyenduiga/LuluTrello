import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractedSource } from './source-text.service';
import { DEFAULT_SLIDES, DeckLanguage, MAX_BULLETS, MAX_SLIDES } from './dto/slides.dto';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Same default as the Zalo assistant: gemini-2.5-flash is refused for new API
// keys. Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/** Reading whole documents takes longer than answering a chat message. */
const GEMINI_TIMEOUT_MS = 90_000;

/** Upper bound on the source text handed to the model, across all sources. */
const MAX_TOTAL_CHARS = 90_000;

export interface DeckSlide {
  title: string;
  bullets: string[];
  notes?: string;
}

export interface DeckOutline {
  title: string;
  subtitle?: string;
  slides: DeckSlide[];
  /** 'gemini' when the model wrote it, 'excerpt' when it was cut up mechanically. */
  generatedBy: 'gemini' | 'excerpt';
  warnings: string[];
}

export interface OutlineOptions {
  title?: string;
  slideCount?: number;
  language?: DeckLanguage;
  audience?: string;
  boardName?: string;
}

/**
 * Turns the text of the chosen attachments into a slide outline.
 *
 * With GEMINI_API_KEY set the model writes it, grounded strictly in the source
 * text. Without a key the sources are cut into slides mechanically instead of
 * failing, so the feature still produces a deck - just a rougher one.
 */
@Injectable()
export class DeckOutlineService {
  private readonly logger = new Logger(DeckOutlineService.name);

  constructor(private readonly config: ConfigService) {}

  private get geminiKey(): string | null {
    return (this.config.get<string>('GEMINI_API_KEY') || '').trim() || null;
  }

  get hasModel(): boolean {
    return Boolean(this.geminiKey);
  }

  async build(sources: ExtractedSource[], options: OutlineOptions): Promise<DeckOutline> {
    const usable = sources.filter((source) => source.text);
    const warnings = sources
      .filter((source) => source.error)
      .map((source) => `${source.name}: ${source.error}`);

    if (!usable.length) {
      throw new Error(
        warnings.length
          ? `None of the chosen files could be read. ${warnings.join(' | ')}`
          : 'None of the chosen files could be read',
      );
    }

    const slideCount = Math.min(options.slideCount || DEFAULT_SLIDES, MAX_SLIDES);
    const fallbackTitle = options.title || options.boardName || usable[0].name;

    if (!this.geminiKey) {
      warnings.push('GEMINI_API_KEY is not configured, so the slides are raw excerpts');
      return { ...this.excerptOutline(usable, slideCount, fallbackTitle), warnings };
    }

    try {
      const outline = await this.askGemini(usable, { ...options, slideCount });
      return {
        ...outline,
        title: options.title || outline.title || fallbackTitle,
        warnings,
      };
    } catch (error: any) {
      this.logger.error(`Gemini could not write the outline: ${error.message}`);
      warnings.push(`The model failed (${error.message}), so the slides are raw excerpts`);
      return { ...this.excerptOutline(usable, slideCount, fallbackTitle), warnings };
    }
  }

  // ---- Gemini ----

  private async askGemini(
    sources: ExtractedSource[],
    options: OutlineOptions & { slideCount: number },
  ): Promise<Omit<DeckOutline, 'warnings'>> {
    const key = this.geminiKey!;
    const model = this.config.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const vietnamese = (options.language || 'vi') === 'vi';

    const instruction = [
      vietnamese
        ? 'Bạn soạn dàn ý slide thuyết trình từ tài liệu được cung cấp.'
        : 'You write presentation outlines from the documents you are given.',
      vietnamese ? 'Viết toàn bộ nội dung bằng tiếng Việt.' : 'Write everything in English.',
      vietnamese
        ? 'Chỉ dùng thông tin có trong tài liệu; tuyệt đối không bịa số liệu, tên người hay sự kiện. ' +
          'Mỗi gạch đầu dòng là một câu ngắn, tối đa 20 từ, không dùng markdown. ' +
          'Ghi chú (notes) là lời người thuyết trình sẽ nói, 2-3 câu.'
        : 'Use only what the documents say; never invent figures, names or events. ' +
          'Each bullet is one short sentence of at most 20 words, no markdown. ' +
          'Notes are what the presenter says out loud, 2-3 sentences.',
      options.audience
        ? (vietnamese ? 'Người nghe và trọng tâm: ' : 'Audience and focus: ') + options.audience
        : '',
      vietnamese
        ? `Trả về đúng ${options.slideCount} slide, gồm 1 slide mở đầu và 1 slide kết luận.`
        : `Return exactly ${options.slideCount} slides, including an opening and a closing slide.`,
      'Answer with JSON only, matching: ' +
        '{"title": string, "subtitle": string, "slides": [{"title": string, ' +
        `"bullets": string[] (2-${MAX_BULLETS} items), "notes": string}]}`,
    ]
      .filter(Boolean)
      .join(' ');

    const body = (withThinkingConfig: boolean) =>
      JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.context(sources) },
              {
                text: options.title
                  ? `Deck title: "${options.title}".`
                  : 'Choose a deck title from the documents.',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8000,
          responseMimeType: 'application/json',
          // Gemini 3 reasons before answering; older models reject the field,
          // hence the retry below.
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
      // Thought parts are the model reasoning with itself, not the outline.
      .filter((part: any) => part?.thought !== true)
      .map((part: any) => part?.text || '')
      .join('')
      .trim();

    return this.parseOutline(answer, options.slideCount);
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

  /** The source text, labelled per file so the model can attribute what it uses. */
  private context(sources: ExtractedSource[]): string {
    const budget = Math.floor(MAX_TOTAL_CHARS / sources.length);
    return sources
      .map((source, index) => {
        const text = source.text.length > budget ? source.text.slice(0, budget) : source.text;
        const cut =
          text.length < source.text.length || source.truncated ? '\n[... cắt bớt ...]' : '';
        return `--- Tài liệu ${index + 1}: "${source.name}" ---\n${text}${cut}`;
      })
      .join('\n\n');
  }

  /**
   * The model is asked for JSON, but a stray code fence or a truncated answer is
   * still possible; everything is re-checked rather than trusted.
   */
  private parseOutline(answer: string, slideCount: number): Omit<DeckOutline, 'warnings'> {
    const json = answer
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('the answer was not JSON');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(json.slice(start, end + 1));
    } catch (error: any) {
      throw new Error(`the answer was not valid JSON (${error.message})`, { cause: error });
    }

    const slides: DeckSlide[] = (Array.isArray(parsed?.slides) ? parsed.slides : [])
      .map((slide: any) => ({
        title: this.clamp(slide?.title, 200),
        bullets: (Array.isArray(slide?.bullets) ? slide.bullets : [])
          .map((bullet: any) => this.clamp(bullet, 300))
          .filter(Boolean)
          .slice(0, MAX_BULLETS),
        notes: this.clamp(slide?.notes, 1200) || undefined,
      }))
      .filter((slide: DeckSlide) => slide.title || slide.bullets.length)
      // A model that overshoots the requested length is trimmed, not rejected.
      .slice(0, Math.min(slideCount + 2, MAX_SLIDES));

    if (!slides.length) throw new Error('the answer contained no slides');

    return {
      title: this.clamp(parsed?.title, 120),
      subtitle: this.clamp(parsed?.subtitle, 200) || undefined,
      slides,
      generatedBy: 'gemini',
    };
  }

  private clamp(value: unknown, max: number): string {
    const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  // ---- No-model fallback ----

  /**
   * Cuts the sources into slides without a model: one paragraph becomes one
   * slide, and a short line of its own is read as the heading for the paragraph
   * that follows it. Rough, but grounded - every word came from the documents.
   */
  private excerptOutline(
    sources: ExtractedSource[],
    slideCount: number,
    title: string,
  ): Omit<DeckOutline, 'warnings'> {
    const slides: DeckSlide[] = [];
    const perSource = Math.max(1, Math.floor((slideCount - 1) / sources.length));

    for (const source of sources) {
      const blocks = source.text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);

      let heading = '';
      let taken = 0;

      for (const block of blocks) {
        if (taken >= perSource) break;

        const lines = block
          .split('\n')
          // Drop list markers and Markdown heading hashes: they are formatting,
          // and a slide renders its own bullets.
          .map((line) =>
            line
              .replace(/^#{1,6}\s*/, '')
              .replace(/^[-*•\d.\s]+/, '')
              .trim(),
          )
          .filter(Boolean);
        if (!lines.length) continue;

        // A short line standing alone is a heading, not a slide of its own. A
        // second one in a row replaces the first, so "Kế hoạch / Mục tiêu /
        // <đoạn văn>" titles the slide "Mục tiêu" rather than "Kế hoạch".
        if (lines.length === 1 && lines[0].length < 80) {
          heading = this.clamp(lines[0], 120);
          continue;
        }

        let slideTitle: string;
        let body: string[];
        if (heading) {
          slideTitle = heading;
          body = lines;
        } else if (lines.length > 1) {
          slideTitle = this.clamp(lines[0], 120);
          body = lines.slice(1);
        } else {
          // One long paragraph with nothing to title it: name the file instead,
          // so the paragraph is not printed twice.
          slideTitle = source.name;
          body = lines;
        }
        heading = '';
        taken += 1;

        slides.push({
          title: slideTitle || source.name,
          bullets: body
            .map((line) => this.clamp(line, 300))
            .filter(Boolean)
            .slice(0, MAX_BULLETS),
          notes: `Trích từ "${source.name}".`,
        });
      }
    }

    if (!slides.length) {
      slides.push({
        title: sources[0].name,
        bullets: [this.clamp(sources[0].text, 300)],
      });
    }

    return {
      title: this.clamp(title, 120),
      subtitle: `Trích từ ${sources.length} tài liệu`,
      slides: slides.slice(0, slideCount),
      generatedBy: 'excerpt',
    };
  }
}
