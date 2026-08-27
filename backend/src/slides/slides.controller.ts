import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DocumentData } from '../common/firestore/firestore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CurrentBoard } from '../common/decorators';
import { DeckRequestDto, OutlineRequestDto } from './dto/slides.dto';
import { SlidesService } from './slides.service';
import { SlidesAccessGuard } from './slides-access.guard';

/**
 * Builds a slide deck out of the files uploaded to a board.
 *
 * Everyone who can edit content may upload attachments, but only the board's
 * owner and the administrators in ADMIN_EMAILS may turn them into a deck - see
 * SlidesAccessGuard, which every route below goes through.
 *
 * Two steps on purpose: /outline returns the plan for review and costs one
 * model call, /pptx renders whatever the reviewer settled on. Regenerating the
 * outline is then an explicit choice rather than a side effect of downloading.
 */
@Controller('boards/:boardId/slides')
@UseGuards(JwtAuthGuard, BoardAccessGuard, SlidesAccessGuard)
export class SlidesController {
  constructor(private readonly slides: SlidesService) {}

  /** The files that can be used as sources, and whether a model is configured. */
  @Get('sources')
  async sources(@CurrentBoard() board: DocumentData) {
    const sources = await this.slides.listSources(board.id);
    return {
      sources,
      readable: sources.filter((source) => source.supported).length,
      modelAvailable: this.slides.modelAvailable,
    };
  }

  @Post('outline')
  @HttpCode(HttpStatus.OK)
  outline(@CurrentBoard() board: DocumentData, @Body() dto: OutlineRequestDto) {
    return this.slides.buildOutline(board, dto);
  }

  @Post('pptx')
  @HttpCode(HttpStatus.OK)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  )
  async pptx(
    @CurrentBoard() board: DocumentData,
    @Body() dto: DeckRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.slides.renderDeck(board, dto);
    // The SPA fetches this with an Authorization header and names the download
    // itself; the header is here for anything calling the API directly.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.slides.fileName(dto.title)}"`,
    );
    return new StreamableFile(buffer);
  }
}
