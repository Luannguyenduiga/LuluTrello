import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AskDto {
  @ApiProperty({ example: 'Hôm nay còn task nào quá hạn không?' })
  @IsString()
  question!: string;
}

export class SendTestDto {
  /** Left out, a fixed Vietnamese greeting is sent instead. */
  @ApiPropertyOptional({ example: 'Xin chào từ LuluTrello' })
  @IsOptional()
  @IsString()
  text?: string;

  /** Overrides ZALO_CHAT_ID for this one message, to try a chat id out. */
  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  chatId?: string;
}
