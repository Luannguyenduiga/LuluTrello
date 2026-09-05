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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentData } from '../common/firestore/firestore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CurrentBoard } from '../common/decorators';
import { DeckRequestDto, OutlineRequestDto } from './dto/slides.dto';
import { DeckOutlineResponse, DeckSourcesResponse } from './dto/slides-response.dto';
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
@ApiTags('Slides')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'boardId', description: 'Board whose attachments feed the deck' })
@ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
@ApiForbiddenResponse({ description: 'Only the board owner and ADMIN_EMAILS may build a deck' })
@Controller('boards/:boardId/slides')
@UseGuards(JwtAuthGuard, BoardAccessGuard, SlidesAccessGuard)
export class SlidesController {
  constructor(private readonly slides: SlidesService) {}

  /** The files that can be used as sources, and whether a model is configured. */
  @Get('sources')
  @ApiOperation({ summary: 'Files the deck can be built from' })
  @ApiOkResponse({ type: DeckSourcesResponse })
  async sources(@CurrentBoard() board: DocumentData) {
    const sources = await this.slides.listSources(board.id);
    return {
      // The R2 key is an internal address the picker has no use for; the
      // browser only ever reaches an object through a signed URL.
      sources: sources.map(({ storageKey: _key, ...source }) => source),
      readable: sources.filter((source) => source.supported).length,
      modelAvailable: this.slides.modelAvailable,
    };
  }

  /**
   * Step 1: reads the chosen files and plans the deck. One model call. The
   * outline comes back for review - nothing is rendered yet.
   */
  @Post('outline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan a deck from the chosen sources' })
  @ApiOkResponse({ type: DeckOutlineResponse })
  @ApiBadRequestResponse({ description: 'None of the chosen files belong to this board' })
  outline(@CurrentBoard() board: DocumentData, @Body() dto: OutlineRequestDto) {
    return this.slides.buildOutline(board, dto);
  }

  /**
   * Step 2: renders the reviewed outline into a .pptx file. The slides come from
   * the body rather than being regenerated, so editing the outline is free.
   */
  @Post('pptx')
  @HttpCode(HttpStatus.OK)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  )
  @ApiOperation({ summary: 'Render the deck as a .pptx download' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.presentationml.presentation')
  @ApiOkResponse({
    description: 'The PowerPoint file, named after the deck title',
    schema: { type: 'string', format: 'binary' },
  })
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
