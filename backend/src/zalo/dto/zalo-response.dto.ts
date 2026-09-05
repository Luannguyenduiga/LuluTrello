import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ZaloReportSchedule {
  @ApiProperty({ description: 'IANA zone the report is cut on', example: 'Asia/Bangkok' })
  timezone!: string;

  @ApiProperty({ description: 'Local time of day, HH:mm', example: '18:00' })
  time!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T11:00:00.000Z' })
  nextRunAt!: string;
}

export class ZaloStatusResponse {
  @ApiProperty({ description: 'Whether ZALO_BOT_TOKEN is set', example: true })
  hasToken!: boolean;

  @ApiProperty({ description: 'The configured ZALO_CHAT_ID', nullable: true, example: '123456' })
  chatId!: string | null;

  @ApiProperty({ description: 'Token and chat id are both set and the token works', example: true })
  ready!: boolean;

  /** Whatever the Zalo API says about the bot, or null when there is no token. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  bot!: unknown;

  @ApiProperty({ description: 'Why the token was rejected', nullable: true, example: null })
  tokenError!: string | null;

  @ApiProperty({ type: ZaloReportSchedule })
  report!: ZaloReportSchedule;
}

/** One chat the bot has heard from - this is how a group chat id is found. */
export class ZaloChatResponse {
  @ApiProperty({ description: 'Copy this into ZALO_CHAT_ID', example: '1234567890' })
  id!: string;

  @ApiPropertyOptional({ description: 'PRIVATE for a direct chat, GROUP for a group' })
  type?: string;

  @ApiPropertyOptional({ example: 'Team LuluTrello' })
  name?: string;

  @ApiPropertyOptional()
  lastMessage?: string;

  @ApiPropertyOptional({ description: 'Display name of the sender' })
  from?: string;
}

export class ZaloUpdatesResponse {
  @ApiProperty({ type: [ZaloChatResponse] })
  chats!: ZaloChatResponse[];

  @ApiProperty({
    description: 'The raw updates, as Zalo returned them',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  updates!: unknown[];

  @ApiProperty({ description: 'What to do next, in plain words' })
  hint!: string;
}

export class ZaloTestResponse {
  @ApiProperty({ example: true })
  sent!: boolean;

  @ApiProperty({ description: 'What was posted' })
  text!: string;
}

export class ZaloAskResponse {
  @ApiProperty({ example: 'Hôm nay còn task nào quá hạn không?' })
  question!: string;

  @ApiProperty({ description: 'The answer, which was not posted anywhere' })
  answer!: string;
}

export class ZaloReportPreviewResponse {
  @ApiProperty({ description: 'The report as it would be sent right now' })
  text!: string;
}

export class ZaloReportRunResponse {
  @ApiProperty({ description: 'False when no board has the bot enabled', example: true })
  sent!: boolean;

  @ApiProperty({ description: 'What was posted' })
  text!: string;

  @ApiProperty({ description: 'Boards the report covered', example: 2 })
  boards!: number;
}
