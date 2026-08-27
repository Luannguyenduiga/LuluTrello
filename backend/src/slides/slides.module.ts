import { Module } from '@nestjs/common';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';
import { SourceTextService } from './source-text.service';
import { DeckOutlineService } from './deck-outline.service';
import { SlidesAccessGuard } from './slides-access.guard';

@Module({
  controllers: [SlidesController],
  providers: [
    SlidesService,
    SourceTextService,
    DeckOutlineService,
    BoardAccessGuard,
    SlidesAccessGuard,
  ],
})
export class SlidesModule {}
