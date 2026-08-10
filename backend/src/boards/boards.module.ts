import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardAccessGuard } from '../common/guards/board-access.guard';

@Module({
  controllers: [BoardsController],
  providers: [BoardsService, BoardAccessGuard],
})
export class BoardsModule {}
