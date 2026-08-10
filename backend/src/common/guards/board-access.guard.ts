import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRequest, BOARD_ROLES_KEY } from '../decorators';
import { BoardRole, resolveBoardRole } from '../constants/roles';
import { FirestoreService } from '../firestore/firestore.service';

/**
 * Loads the board named in the URL, rejects anyone who is not a participant,
 * and attaches { board, boardRole } to the request. When the handler carries a
 * @BoardRoles(...) decorator, the caller's role must be one of those too.
 *
 * The board id may arrive as :boardId (nested routes) or :id (the boards controller).
 */
@Injectable()
export class BoardAccessGuard implements CanActivate {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const boardId = request.params.boardId || request.params.id;

    if (!boardId) {
      throw new NotFoundException('Board id is required');
    }

    const board = await this.firestore.findById('boards', boardId);
    if (!board) {
      throw new NotFoundException('Board not found');
    }

    const role = resolveBoardRole(board, request.user?.id);
    if (!role) {
      throw new ForbiddenException('Access denied to this board');
    }

    request.board = board;
    request.boardRole = role;

    const allowedRoles = this.reflector.getAllAndOverride<BoardRole[] | undefined>(
      BOARD_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles?.length && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        `This action requires the ${allowedRoles.join(' or ')} role on this board`,
      );
    }

    return true;
  }
}
