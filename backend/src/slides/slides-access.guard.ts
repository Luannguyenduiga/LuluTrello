import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppRequest } from '../common/decorators';
import { BOARD_MANAGERS, BoardRole } from '../common/constants/roles';
import { isAdminEmail } from '../admin/admin.guard';

/**
 * Who may turn a board's attachments into a slide deck: whoever manages the
 * board - its owner and its leaders - plus anyone listed in ADMIN_EMAILS.
 *
 * Narrower than CONTENT_EDITORS: plain members and viewers may upload the files
 * that become sources, but a deck speaks for the whole board.
 *
 * Runs after BoardAccessGuard, which has already established that the caller is
 * on this board and filled in request.boardRole. Board membership therefore
 * still applies to administrators: the console at /admin is the place that spans
 * boards, not this.
 */
@Injectable()
export class SlidesAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AppRequest>();

    if (BOARD_MANAGERS.includes(request.boardRole as BoardRole)) return true;
    if (isAdminEmail(this.config, request.user?.email)) return true;

    throw new ForbiddenException(
      'Only the board owner, a board leader or a system administrator can build a slide deck',
    );
  }
}
