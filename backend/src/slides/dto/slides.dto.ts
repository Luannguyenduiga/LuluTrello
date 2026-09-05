import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** How many attachments one deck may be built from. */
export const MAX_SOURCES = 20;

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 30;
export const DEFAULT_SLIDES = 10;

/** Bullets per slide - past this a slide stops being readable from the back row. */
export const MAX_BULLETS = 6;

export type DeckLanguage = 'vi' | 'en';

/** Step 1: pick the sources, get an outline back for review. */
export class OutlineRequestDto {
  /** Attachment ids from `GET /boards/{boardId}/slides/sources`. */
  @ApiProperty({ type: [String], maxItems: MAX_SOURCES, example: ['a_5Gh6Ij7K'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Pick at least one source file' })
  @ArrayMaxSize(MAX_SOURCES, { message: `At most ${MAX_SOURCES} sources per deck` })
  @IsString({ each: true })
  sourceIds!: string[];

  /** Left out, the model titles the deck itself. */
  @ApiPropertyOptional({ maxLength: 120, example: 'Marketing Q3 review' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    minimum: MIN_SLIDES,
    maximum: MAX_SLIDES,
    default: DEFAULT_SLIDES,
    example: DEFAULT_SLIDES,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SLIDES)
  @Max(MAX_SLIDES)
  slideCount?: number;

  @ApiPropertyOptional({ enum: ['vi', 'en'], example: 'vi' })
  @IsOptional()
  @IsIn(['vi', 'en'])
  language?: DeckLanguage;

  /** Free text: who the deck is for, what it should emphasise. */
  @ApiPropertyOptional({ maxLength: 300, example: 'Ban giám đốc, tập trung vào kết quả' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  audience?: string;
}

export class SlideDto {
  @ApiProperty({ maxLength: 200, example: 'Where the campaign stands' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    type: [String],
    maxItems: MAX_BULLETS,
    example: ['Reach up 18% month on month', 'Two channels still behind plan'],
  })
  @IsArray()
  @ArrayMaxSize(MAX_BULLETS)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  bullets!: string[];

  /** Speaker notes, kept out of the slide body. */
  @ApiPropertyOptional({ maxLength: 1200 })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;
}

/**
 * Step 2: render a deck. The slides come back from the client rather than being
 * regenerated, so the admin can edit the outline before downloading it - and so
 * one deck costs exactly one Gemini call.
 */
export class DeckRequestDto {
  @ApiProperty({ maxLength: 120, example: 'Marketing Q3 review' })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Where the campaign stands' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiProperty({ type: [SlideDto], maxItems: MAX_SLIDES })
  @IsArray()
  @ArrayNotEmpty({ message: 'A deck needs at least one slide' })
  @ArrayMaxSize(MAX_SLIDES)
  @ValidateNested({ each: true })
  @Type(() => SlideDto)
  slides!: SlideDto[];

  /** Names of the files the deck was built from, listed on the closing slide. */
  @ApiPropertyOptional({ type: [String], maxItems: MAX_SOURCES, example: ['brief.pdf'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SOURCES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  sourceNames?: string[];
}
