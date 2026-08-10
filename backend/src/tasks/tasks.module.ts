import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CardInBoardGuard } from '../common/guards/card-in-board.guard';
import { TaskInBoardGuard } from '../common/guards/task-in-board.guard';

@Module({
  controllers: [TasksController],
  providers: [BoardAccessGuard, CardInBoardGuard, TaskInBoardGuard],
})
export class TasksModule {}
