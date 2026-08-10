import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { AppRequest } from '../decorators';

/**
 * Ensures the task in the URL belongs to the board (and card) in the URL, so a
 * task id from another board can never be read or mutated through it.
 */
@Injectable()
export class TaskInBoardGuard implements CanActivate {
  constructor(private readonly firestore: FirestoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const taskId = request.params.taskId;

    if (!taskId) {
      throw new NotFoundException('Task id is required');
    }

    const task = await this.firestore.findById('tasks', taskId);
    if (!task || task.boardId !== request.board?.id) {
      throw new NotFoundException('Task not found in this board');
    }
    if (request.card && task.cardId !== request.card.id) {
      throw new NotFoundException('Task not found in this card');
    }

    request.task = task;
    return true;
  }
}
