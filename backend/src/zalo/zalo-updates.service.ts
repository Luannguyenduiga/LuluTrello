import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloRateLimitError, ZaloService } from './zalo.service';
import { ZaloAssistantService } from './zalo-assistant.service';

/** How long each poll waits for a message before starting the next one. */
const POLL_SECONDS = 25;

/** Pause after a failed poll, so a broken token does not spin the loop. */
const ERROR_BACKOFF_MS = 10_000;

/**
 * Zalo answers 429 when polls arrive too fast - or when a second poller is
 * already connected with the same token. Retrying straight away only deepens
 * it, so each rate limit doubles the wait up to a ceiling.
 */
const RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 240_000;

/** Small gap between polls, so reconnects are not back-to-back. */
const POLL_GAP_MS = 1_000;

/** Recently answered message ids, kept so a redelivery is not answered twice. */
const SEEN_LIMIT = 200;

/**
 * Listens for questions addressed to the bot and answers them.
 *
 * Zalo delivers messages by long polling (getUpdates), so this is a loop rather
 * than a webhook - which also means it needs no public URL and works the same
 * locally and in production.
 *
 * In a group the bot only answers when it is tagged; in a one-to-one chat every
 * message is a question for it. Messages from other bots are ignored outright,
 * so two bots in one group cannot talk each other into a loop.
 */
@Injectable()
export class ZaloUpdatesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ZaloUpdatesService.name);
  private readonly seen = new Set<string>();
  private running = false;
  private botNames: string[] = [];

  constructor(
    private readonly zalo: ZaloService,
    private readonly assistant: ZaloAssistantService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.zalo.hasToken) return;
    if ((this.config.get<string>('ZALO_REPLY_ENABLED') || '').toLowerCase() === 'false') {
      this.logger.log('ZALO_REPLY_ENABLED=false - the bot will not answer questions.');
      return;
    }

    this.running = true;
    void this.loop();
  }

  onModuleDestroy(): void {
    // The loop checks this between polls, so shutdown waits at most one poll.
    this.running = false;
  }

  private async loop(): Promise<void> {
    await this.learnOwnName();
    this.logger.log('Listening for questions addressed to the Zalo bot.');

    let rateLimitWait = RATE_LIMIT_BACKOFF_MS;

    while (this.running) {
      try {
        const updates = await this.zalo.getUpdates(undefined, POLL_SECONDS);
        rateLimitWait = RATE_LIMIT_BACKOFF_MS;
        for (const update of updates) {
          await this.handle(update);
        }
        await this.pause(POLL_GAP_MS);
      } catch (error: any) {
        if (error instanceof ZaloRateLimitError) {
          this.logger.warn(
            `Zalo is rate limiting the bot; waiting ${Math.round(rateLimitWait / 1000)}s. ` +
              'This also happens when another instance polls with the same token.',
          );
          await this.pause(rateLimitWait);
          rateLimitWait = Math.min(rateLimitWait * 2, MAX_RATE_LIMIT_BACKOFF_MS);
          continue;
        }
        this.logger.error(`Polling Zalo failed: ${error.message}`);
        await this.pause(ERROR_BACKOFF_MS);
      }
    }
  }

  /** The bot's own display name, needed to recognise being tagged in a group. */
  private async learnOwnName(): Promise<void> {
    try {
      const me = await this.zalo.getMe();
      this.botNames = [me.display_name, me.account_name]
        .filter((name): name is string => Boolean(name))
        .map((name) => name.toLowerCase());
    } catch (error: any) {
      this.logger.warn(`Could not read the bot's own name: ${error.message}`);
    }
  }

  private async handle(update: any): Promise<void> {
    const message = update?.message;
    const chatId = message?.chat?.id ? String(message.chat.id) : null;
    const text: string = typeof message?.text === 'string' ? message.text : '';
    const messageId = message?.message_id ? String(message.message_id) : null;

    if (!chatId || !text.trim()) return;
    if (message?.from?.is_bot) return;
    if (messageId && this.seen.has(messageId)) return;
    if (messageId) this.remember(messageId);

    const isGroup =
      String(message.chat.chat_type || message.chat.type || '').toUpperCase() !== 'PRIVATE';
    const question = this.stripMention(text);
    // In a group, anything that does not tag the bot is a conversation between
    // people and none of the bot's business.
    if (isGroup && question === null) return;

    const asker: string | undefined = message?.from?.display_name;
    const reply = await this.assistant.answer(question ?? text, asker);

    try {
      await this.zalo.sendMessage(reply, chatId);
    } catch (error: any) {
      this.logger.error(`Could not reply in chat ${chatId}: ${error.message}`);
    }
  }

  /**
   * Removes the "@Bot ..." tag and returns the question. null means the bot was
   * not addressed at all.
   */
  private stripMention(text: string): string | null {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    for (const name of this.botNames) {
      for (const tag of [`@${name}`, name]) {
        const at = lower.indexOf(tag);
        if (at !== -1) {
          return (trimmed.slice(0, at) + trimmed.slice(at + tag.length)).trim();
        }
      }
    }

    // A bare "@something" still counts as addressing the bot: the tag Zalo
    // inserts does not always match the name getMe reports.
    if (trimmed.startsWith('@')) {
      const afterTag = trimmed.replace(/^@\S+\s*/, '').trim();
      return afterTag || '';
    }
    return null;
  }

  /** Interruptible wait: a shutdown does not have to sit out a long backoff. */
  private async pause(ms: number): Promise<void> {
    const step = 1_000;
    for (let waited = 0; waited < ms && this.running; waited += step) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(step, ms - waited)));
    }
  }

  private remember(messageId: string): void {
    this.seen.add(messageId);
    if (this.seen.size > SEEN_LIMIT) {
      // Insertion order: dropping the oldest keeps the window recent.
      this.seen.delete(this.seen.values().next().value as string);
    }
  }
}
