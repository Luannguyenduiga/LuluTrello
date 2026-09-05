import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ZaloAdminGuard } from './zalo-admin.guard';
import { ZaloService } from './zalo.service';
import { ZaloReportService } from './zalo-report.service';
import { ZaloAssistantService } from './zalo-assistant.service';
import { AskDto, SendTestDto } from './dto/zalo.dto';
import {
  ZaloAskResponse,
  ZaloReportPreviewResponse,
  ZaloReportRunResponse,
  ZaloStatusResponse,
  ZaloTestResponse,
  ZaloUpdatesResponse,
} from './dto/zalo-response.dto';

/**
 * Setup and operations endpoints for the Zalo assistant. All of them require the
 * `x-zalo-secret` header (see ZaloAdminGuard).
 */
@ApiTags('Zalo')
// Two ways in: the shared secret for machines, an admin's own JWT for the console.
@ApiSecurity('zalo-secret')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Neither an admin session nor a valid x-zalo-secret' })
@Controller('zalo')
@UseGuards(ZaloAdminGuard)
export class ZaloController {
  constructor(
    private readonly zalo: ZaloService,
    private readonly report: ZaloReportService,
    private readonly assistant: ZaloAssistantService,
  ) {}

  /** Is the bot wired up, and does the token still work? */
  @Get('status')
  @ApiOperation({ summary: 'Bot configuration and report schedule' })
  @ApiOkResponse({ type: ZaloStatusResponse })
  async status() {
    let bot: unknown = null;
    let tokenError: string | null = null;
    if (this.zalo.hasToken) {
      try {
        bot = await this.zalo.getMe();
      } catch (error: any) {
        tokenError = error.message;
      }
    }

    return {
      hasToken: this.zalo.hasToken,
      chatId: this.zalo.chatId,
      ready: this.zalo.isConfigured && !tokenError,
      bot,
      tokenError,
      report: {
        timezone: this.report.timezone,
        time: `${String(this.report.reportTime.hour).padStart(2, '0')}:${String(
          this.report.reportTime.minute,
        ).padStart(2, '0')}`,
        nextRunAt: this.report.nextRunAt.toISOString(),
      },
    };
  }

  /**
   * Pending updates, which is how a group chat id is found: add the bot to the
   * group, send any message there, then read `message.chat.id` from here.
   */
  @Get('updates')
  @ApiOperation({ summary: 'Recent updates, to discover a chat id' })
  @ApiQuery({ name: 'offset', required: false, description: 'Skip updates already seen' })
  @ApiQuery({ name: 'wait', required: false, description: 'Long-poll seconds' })
  @ApiOkResponse({ type: ZaloUpdatesResponse })
  async updates(@Query('offset') offset?: string, @Query('wait') wait?: string) {
    const updates = await this.zalo.getUpdates(
      offset ? Number(offset) : undefined,
      wait ? Number(wait) : undefined,
    );
    const chats = new Map<
      string,
      { id: string; type?: string; name?: string; lastMessage?: string; from?: string }
    >();

    for (const update of updates || []) {
      const chat = update?.message?.chat;
      if (chat?.id) {
        chats.set(String(chat.id), {
          id: String(chat.id),
          // 'PRIVATE' is a one-to-one chat with the bot; a group reports GROUP.
          type: chat.chat_type || chat.type,
          name: chat.title || chat.name || chat.chat_name,
          lastMessage: update?.message?.text,
          from: update?.message?.from?.display_name,
        });
      }
    }

    return {
      chats: [...chats.values()],
      updates,
      hint: chats.size
        ? 'Copy the chat id of the group into ZALO_CHAT_ID.'
        : 'No message reached the bot yet - send one in the group, then call this again.',
    };
  }

  /** Sends a message to verify the group receives it. */
  @Post('test')
  @ApiOperation({ summary: 'Post a test message to the group' })
  @ApiCreatedResponse({ type: ZaloTestResponse })
  async test(@Body() dto: SendTestDto) {
    const text = dto.text || '🤖 Trợ lý LuluTrello đã kết nối thành công với nhóm này.';
    const sent = await this.zalo.sendMessage(text, dto.chatId);
    return { sent, text };
  }

  /**
   * The answer the bot would give to a question, without posting it anywhere -
   * the way to try the question-and-answer side without writing in the group.
   */
  @Post('ask')
  @ApiOperation({ summary: 'Ask the assistant without posting' })
  @ApiCreatedResponse({ type: ZaloAskResponse })
  async ask(@Body() dto: AskDto) {
    return { question: dto.question, answer: await this.assistant.answer(dto.question) };
  }

  /** The report as it would be sent right now, without sending it. */
  @Get('report/preview')
  @ApiOperation({ summary: 'Preview the progress report' })
  @ApiOkResponse({ type: ZaloReportPreviewResponse })
  async preview() {
    return { text: await this.report.buildReport() };
  }

  /**
   * Sends the progress report now. Also the hook for an external scheduler when
   * the host puts the process to sleep and in-process timers cannot fire.
   */
  @Post('report/run')
  @ApiOperation({ summary: 'Send the progress report now' })
  @ApiCreatedResponse({ type: ZaloReportRunResponse })
  run() {
    return this.report.runNow();
  }
}
