import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SlideDto } from './slides.dto';

/** One attachment of the board, offered as a source for the deck. */
export class DeckSourceResponse {
  @ApiProperty({ example: 'a_5Gh6Ij7K' })
  id!: string;

  @ApiProperty({ example: 'brief.pdf' })
  name!: string;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  type!: string;

  @ApiProperty({ description: 'Bytes', example: 182_344 })
  size!: number;

  @ApiProperty({ description: 'Empty for files kept in R2', example: '' })
  url!: string;

  @ApiProperty({ format: 'date-time', nullable: true, example: '2026-01-01T00:00:00.000Z' })
  uploadedAt!: string | null;

  @ApiProperty({ example: 't_4Ef5Gh6I' })
  taskId!: string;

  @ApiProperty({ example: 'Draft the launch email' })
  taskTitle!: string;

  @ApiProperty({ example: 'c_1Ab2Cd3E' })
  cardId!: string;

  @ApiProperty({ example: 'In progress' })
  cardName!: string;

  /** False when no text can be read out of it - an image or a .zip, say. */
  @ApiProperty({ example: true })
  supported!: boolean;
}

export class DeckSourcesResponse {
  @ApiProperty({ type: [DeckSourceResponse] })
  sources!: DeckSourceResponse[];

  @ApiProperty({ description: 'How many of those files text can be read from', example: 3 })
  readable!: number;

  /** False when no Gemini key is configured; outlines then fall back to excerpts. */
  @ApiProperty({ example: true })
  modelAvailable!: boolean;
}

export class DeckSourceRefResponse {
  @ApiProperty({ example: 'a_5Gh6Ij7K' })
  id!: string;

  @ApiProperty({ example: 'brief.pdf' })
  name!: string;
}

/** The plan for the deck, for review before anything is rendered. */
export class DeckOutlineResponse {
  @ApiProperty({ example: 'Marketing Q3 review' })
  title!: string;

  @ApiPropertyOptional({ example: 'Where the campaign stands' })
  subtitle?: string;

  @ApiProperty({ type: [SlideDto] })
  slides!: SlideDto[];

  @ApiProperty({
    description: '`gemini` when the model wrote it, `excerpt` when it was cut up mechanically.',
    enum: ['gemini', 'excerpt'],
    example: 'gemini',
  })
  generatedBy!: string;

  @ApiProperty({
    description: 'Sources that could not be read, and anything else worth showing the reviewer.',
    type: [String],
    example: [],
  })
  warnings!: string[];

  @ApiProperty({ type: [DeckSourceRefResponse] })
  sources!: DeckSourceRefResponse[];
}
