import { DocumentData } from '../firestore/firestore.service';

/**
 * Role model:
 *   'owner'  -> board.ownerId, exactly one per board, cannot be reassigned here
 *   'leader' -> may also change board settings
 *   'member' -> may create/edit cards and tasks, and invite people
 *   'viewer' -> read-only
 *
 * `board.members` stays the list of who has access, and the role of each of them
 * lives in the `board.roles` map: { [userId]: 'leader' | 'member' | 'viewer' }.
 * A member with no entry in that map is treated as 'member', so boards created
 * before roles existed keep working without a migration.
 */
export enum BoardRole {
  OWNER = 'owner',
  LEADER = 'leader',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/** Roles that can be handed out when inviting somebody (owner is not assignable) */
export const ASSIGNABLE_ROLES: BoardRole[] = [BoardRole.LEADER, BoardRole.MEMBER, BoardRole.VIEWER];

/** Roles allowed to create/modify/delete board content (cards and tasks) */
export const CONTENT_EDITORS: BoardRole[] = [BoardRole.OWNER, BoardRole.LEADER, BoardRole.MEMBER];

/** Roles allowed to change board settings */
export const BOARD_MANAGERS: BoardRole[] = [BoardRole.OWNER, BoardRole.LEADER];

export const isAssignableRole = (value: unknown): value is BoardRole =>
  ASSIGNABLE_ROLES.includes(value as BoardRole);

export const resolveBoardRole = (
  board: DocumentData | null | undefined,
  userId: string | undefined,
): BoardRole | null => {
  if (!board || !userId) return null;
  if (board.ownerId === userId) return BoardRole.OWNER;
  if (!Array.isArray(board.members) || !board.members.includes(userId)) return null;

  const stored = board.roles ? board.roles[userId] : null;
  return isAssignableRole(stored) ? stored : BoardRole.MEMBER;
};
