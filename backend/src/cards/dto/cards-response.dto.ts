import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A column of the board. Its tasks are fetched separately. */
export class CardResponse {
  @ApiProperty({ example: 'c_1Ab2Cd3E' })
  id!: string;

  @ApiProperty({ example: 'In progress' })
  name!: string;

  @ApiPropertyOptional({ example: 'Work that somebody has already started' })
  description?: string;
}

export class CardListItemResponse extends CardResponse {
  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;
}
