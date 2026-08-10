import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { BoardRole } from '../constants/roles';
import { DocumentData } from '../firestore/firestore.service';

export interface JwtUser {
  id: string;
  email: string;
}

/**
 * The request as it flows through this app's guards. Each guard fills in one
 * more field, so downstream guards and handlers can rely on typed values
 * instead of reaching into an `any`.
 */
export interface AppRequest {
  params: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: JwtUser;
  board?: DocumentData;
  boardRole?: BoardRole;
  card?: DocumentData;
  task?: DocumentData;
}

export const BOARD_ROLES_KEY = 'boardRoles';

/**
 * Restricts a handler to specific board roles. Read by BoardAccessGuard, so it
 * only has an effect on routes that also go through that guard.
 */
export const BoardRoles = (...roles: BoardRole[]) => SetMetadata(BOARD_ROLES_KEY, roles);

/** The authenticated user decoded from the JWT */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    return data ? request.user?.[data] : request.user;
  },
);

/** The board loaded and authorized by BoardAccessGuard */
export const CurrentBoard = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().board;
});

/** The caller's role on the current board */
export const CurrentBoardRole = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().boardRole;
});

/** The card loaded and validated by CardInBoardGuard */
export const CurrentCard = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().card;
});

/** The task loaded and validated by TaskInBoardGuard */
export const CurrentTask = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().task;
});
