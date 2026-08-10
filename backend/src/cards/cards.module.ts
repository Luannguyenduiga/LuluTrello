import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { BoardAccessGuard } from '../common/guards/board-access.guard';

@Module({
  controllers: [CardsController],
  providers: [BoardAccessGuard],
})
export class CardsModule {}
