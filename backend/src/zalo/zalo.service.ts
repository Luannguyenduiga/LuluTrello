import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Zalo Bot API - the same request shape as Telegram's Bot API:
 * POST https://bot-api.zapps.me/bot<token>/<method> with a JSON body, and a
 * { ok, result } / { ok: false, description, error_code } envelope back.
 */
const ZALO_BOT_API = 'https://bot-api.zapps.me';

/** Zalo rejects very long texts, so reports are cut into several messages. */
const MAX_MESSAGE_CHARS = 1800;

/** No request may hang: getUpdates long-polls and holds the socket open. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** How long getUpdates is allowed to wait for a message to arrive. */
const DEFAULT_POLL_SECONDS = 10;

/** Raised when a call is aborted, so long-poll timeouts can be told apart. */
export class ZaloTimeoutError extends Error {}

/** Raised on HTTP 429, so callers can back off instead of hammering Zalo. */
export class ZaloRateLimitError extends Error {}

export interface ZaloBotIdentity {
  id?: string | number;
  account_name?: string;
  display_name?: string;
  [key: string]: unknown;
}

/**
 * Low-level client. Every higher-level service goes through here, so there is a
 * single place that knows the endpoint, the token and the "not configured"
 * behaviour: like MailService, a missing token logs the payload instead of
 * throwing, so board activity never fails because the bot is unset up.
 */
@Injectable()
export class ZaloService implements OnModuleInit {
  private readonly logger = new Logger(ZaloService.name);
  private token: string | null = null;
  private defaultChatId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.token = (this.config.get<string>('ZALO_TOKEN') || '').trim() || null;
    this.defaultChatId = (this.config.get<string>('ZALO_CHAT_ID') || '').trim() || null;

    if (!this.token) {
      this.logger.warn(
        'ZALO_TOKEN is not set - Zalo notifications will be logged instead of sent.',
      );
    } else if (!this.defaultChatId) {
      this.logger.warn(
        'ZALO_TOKEN is set but ZALO_CHAT_ID is empty - add the bot to the group, send it a message, ' +
          'then read the chat id from GET /zalo/updates and put it in ZALO_CHAT_ID.',
      );
    } else {
      this.logger.log(`Zalo bot configured, notifications go to chat ${this.defaultChatId}.`);
    }
  }

  /** True when both a token and a destination chat are available. */
  get isConfigured(): boolean {
    return Boolean(this.token && this.defaultChatId);
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  get chatId(): string | null {
    return this.defaultChatId;
  }

  /**
   * Calls one Bot API method. Throws with the API's own description, which is
   * what actually explains a failure (expired token, bot not in the group).
   */
  async call<T = any>(
    method: string,
    payload?: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    if (!this.token) {
      throw new Error('ZALO_TOKEN is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${ZALO_BOT_API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: any) {
      // An aborted request is reported as such rather than as a generic failure:
      // getUpdates times out routinely when nobody has written to the bot.
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new ZaloTimeoutError(`Zalo API ${method} timed out after ${timeoutMs} ms`);
      }
      throw error;
    }

    // Rate limiting is answered by nginx with an HTML page rather than the
    // usual JSON envelope, so it is recognised before anything is parsed.
    if (response.status === 429) {
      throw new ZaloRateLimitError(`Zalo API ${method} is rate limited (429)`);
    }

    const raw = await response.text();
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`Zalo API ${method} returned ${response.status}: ${raw.slice(0, 300)}`);
    }

    if (!response.ok || body?.ok === false) {
      const code = body?.error_code ?? response.status;
      const detail = body?.description || raw.slice(0, 300);
      // 408 is how a long poll reports "nothing arrived in time", which is the
      // normal answer to getUpdates on a quiet bot rather than a failure.
      if (code === 408) {
        throw new ZaloTimeoutError(`Zalo API ${method} timed out: ${detail}`);
      }
      throw new Error(`Zalo API ${method} failed (${code}): ${detail}`);
    }

    return (body?.result ?? body) as T;
  }

  /** Who the token belongs to; used by /zalo/status to verify the token works. */
  getMe(): Promise<ZaloBotIdentity> {
    return this.call<ZaloBotIdentity>('getMe');
  }

  /**
   * Pending updates. The only practical way to learn a group's chat id is to
   * read it off a message somebody sent in that group after adding the bot.
   *
   * This long-polls: with nothing queued Zalo simply holds the connection until
   * a message arrives, so an empty result is the normal "nobody wrote yet" case
   * rather than an error.
   */
  async getUpdates(offset?: number, waitSeconds: number = DEFAULT_POLL_SECONDS): Promise<any[]> {
    try {
      const result = await this.call<unknown>(
        'getUpdates',
        { timeout: waitSeconds, ...(offset ? { offset } : {}) },
        waitSeconds * 1000 + 5_000,
      );
      // Zalo answers a long poll with the single update that woke it up, not
      // with a list, so both shapes are normalised to an array here.
      if (Array.isArray(result)) return result;
      return result ? [result] : [];
    } catch (error) {
      if (error instanceof ZaloTimeoutError) return [];
      throw error;
    }
  }

  /**
   * Sends text to the group. Returns false when no bot is configured, so callers
   * can log the message rather than pretend it was delivered.
   */
  async sendMessage(text: string, chatId?: string): Promise<boolean> {
    const target = chatId || this.defaultChatId;
    if (!this.token || !target) {
      this.logger.log(`Zalo not configured - message not sent:\n${text}`);
      return false;
    }

    for (const chunk of this.splitMessage(text)) {
      await this.call('sendMessage', { chat_id: target, text: chunk });
    }
    return true;
  }

  /** Splits on line boundaries so a report never breaks mid-line. */
  private splitMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_CHARS) return [text];

    const chunks: string[] = [];
    let current = '';
    for (const line of text.split('\n')) {
      // A single over-long line is hard-cut; anything else keeps its line breaks.
      if (line.length > MAX_MESSAGE_CHARS) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        for (let i = 0; i < line.length; i += MAX_MESSAGE_CHARS) {
          chunks.push(line.slice(i, i + MAX_MESSAGE_CHARS));
        }
        continue;
      }
      if (current.length + line.length + 1 > MAX_MESSAGE_CHARS) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}
