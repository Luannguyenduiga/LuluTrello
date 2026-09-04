import { DocumentData } from '../common/firestore/firestore.service';

/**
 * The bot posts into one shared group chat, so what it may talk about is decided
 * per board rather than globally: a personal board - a to-do list that is nobody
 * else's business - must not be broadcast to the group just because it lives in
 * the same workspace.
 *
 * Boards are therefore silent until somebody opts them in, and only the owner
 * may do so (see BoardsService.updateBoardDetails). A leader is trusted with the
 * board's own settings but not with publishing it to a chat the owner may not
 * even be in.
 */
export const ZALO_BOARD_FLAG = 'zaloEnabled';

/**
 * Missing means off. Every board that existed before this flag did stays private
 * until its owner turns the bot on, which is the safe direction to default in:
 * the failure mode of "off" is a missing notification, of "on" a leaked one.
 */
export const isZaloBoard = (board: DocumentData | null | undefined): boolean =>
  board?.[ZALO_BOARD_FLAG] === true;

/** The boards the bot is allowed to watch, out of everything in Firestore. */
export const zaloBoards = (boards: DocumentData[]): DocumentData[] => boards.filter(isZaloBoard);
