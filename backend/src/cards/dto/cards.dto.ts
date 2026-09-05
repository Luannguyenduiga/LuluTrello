import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCardDto {
  @ApiProperty({ description: 'Column heading shown on the board', example: 'In progress' })
  @IsString()
  @IsNotEmpty({ message: 'Card name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Work that somebody has already started' })
  @IsOptional()
  @IsString()
  description?: string;

  /** Only honoured on import; a normal client leaves this to the server. */
  @ApiPropertyOptional({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class UpdateCardDto {
  @ApiPropertyOptional({ example: 'Done' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** Free-form client state kept with the column, such as its colour or order. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { color: 'blue' } })
  @IsOptional()
  params?: Record<string, any>;
}
