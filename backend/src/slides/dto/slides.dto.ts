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
  @IsArray()
  @ArrayNotEmpty({ message: 'Pick at least one source file' })
  @ArrayMaxSize(MAX_SOURCES, { message: `At most ${MAX_SOURCES} sources per deck` })
  @IsString({ each: true })
  sourceIds!: string[];

  @IsOptional() @IsString() @MaxLength(120) title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SLIDES)
  @Max(MAX_SLIDES)
  slideCount?: number;

  @IsOptional() @IsIn(['vi', 'en']) language?: DeckLanguage;

  /** Free text: who the deck is for, what it should emphasise. */
  @IsOptional() @IsString() @MaxLength(300) audience?: string;
}

export class SlideDto {
  @IsString() @MaxLength(200) title!: string;

  @IsArray()
  @ArrayMaxSize(MAX_BULLETS)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  bullets!: string[];

  /** Speaker notes, kept out of the slide body. */
  @IsOptional() @IsString() @MaxLength(1200) notes?: string;
}

/**
 * Step 2: render a deck. The slides come back from the client rather than being
 * regenerated, so the admin can edit the outline before downloading it - and so
 * one deck costs exactly one Gemini call.
 */
export class DeckRequestDto {
  @IsString() @MaxLength(120) title!: string;

  @IsOptional() @IsString() @MaxLength(200) subtitle?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'A deck needs at least one slide' })
  @ArrayMaxSize(MAX_SLIDES)
  @ValidateNested({ each: true })
  @Type(() => SlideDto)
  slides!: SlideDto[];

  /** Names of the files the deck was built from, listed on the closing slide. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SOURCES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  sourceNames?: string[];
}
