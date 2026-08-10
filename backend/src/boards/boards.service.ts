import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { EventsGateway } from '../common/realtime/events.gateway';
import { BoardRole, isAssignableRole } from '../common/constants/roles';
import { JwtUser } from '../common/decorators';
import {
  CreateBoardDto,
  InviteMemberDto,
  ResolveInvitationDto,
  UpdateBoardDto,
} from './dto/boards.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly events: EventsGateway,
  ) {}

  async createBoard(dto: CreateBoardDto, user: JwtUser) {
    const created = await this.firestore.insert('boards', {
      name: dto.name,
      description: dto.description || '',
      ownerId: user.id,
      members: [user.id], // owner is the first member
      roles: {},
      createdAt: new Date().toISOString(),
    });

    return { id: created.id, name: created.name, description: created.description };
  }

  async getBoards(user: JwtUser) {
    const userBoards = await this.firestore.find(
      'boards',
      (b) => b.ownerId === user.id || (Array.isArray(b.members) && b.members.includes(user.id)),
    );

    return userBoards.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      ownerId: b.ownerId,
      members: b.members,
    }));
  }

  async getPendingInvitations(user: JwtUser) {
    const account = await this.firestore.findById('users', user.id);

    const pendingInvites = await this.firestore.find('invitations', (invite) => {
      if (invite.status !== 'pending') return false;
      const matchesId = invite.member_id === user.id;
      const matchesEmail =
        account &&
        invite.email_member &&
        invite.email_member.toLowerCase() === account.email.toLowerCase();
      return Boolean(matchesId || matchesEmail);
    });

    return Promise.all(
      pendingInvites.map(async (invite) => {
        const board = await this.firestore.findById('boards', invite.boardId);
        const owner = await this.firestore.findById('users', invite.board_owner_id);
        return {
          ...invite,
          boardName: board ? board.name : 'Unknown Board',
          ownerName: owner ? owner.name : 'Unknown User',
        };
      }),
    );
  }

  /** Access already enforced by BoardAccessGuard, which supplies board and role. */
  getBoardDetails(board: DocumentData, role: BoardRole) {
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      ownerId: board.ownerId,
      members: board.members || [],
      // Per-user roles, plus the caller's own role so the client can hide
      // actions the current user is not allowed to perform
      roles: board.roles || {},
      role,
    };
  }

  async updateBoardDetails(board: DocumentData, dto: UpdateBoardDto) {
    const updated = await this.firestore.update('boards', board.id, {
      name: dto.name || board.name,
      description: dto.description !== undefined ? dto.description : board.description,
    });

    this.events.emitToBoard(board.id, 'board_updated', {
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });

    return { id: updated.id, name: updated.name, description: updated.description };
  }

  async deleteBoard(board: DocumentData) {
    // Remove the board's content too, otherwise cards, tasks and invitations
    // linger in Firestore forever with no way to reach them.
    for (const collection of ['tasks', 'cards', 'invitations']) {
      const orphans = await this.firestore.find(collection, (item) => item.boardId === board.id);
      await Promise.all(orphans.map((item) => this.firestore.delete(collection, item.id)));
    }

    await this.firestore.delete('boards', board.id);
    this.events.emitToBoard(board.id, 'board_deleted', { id: board.id });
  }

  async inviteMember(
    board: DocumentData,
    callerRole: BoardRole,
    dto: InviteMemberDto,
    user: JwtUser,
  ) {
    if (!dto.member_id && !dto.email_member) {
      throw new BadRequestException('A member id or an email address is required');
    }

    // The role the invitee will get once they accept. 'owner' is never assignable.
    const invitedRole = dto.role || BoardRole.MEMBER;

    // Only the owner and admins may hand out the admin role
    if (
      invitedRole === BoardRole.ADMIN &&
      callerRole !== BoardRole.OWNER &&
      callerRole !== BoardRole.ADMIN
    ) {
      throw new ForbiddenException('Only the owner or an admin can invite someone as admin');
    }

    let finalMemberId = dto.member_id;
    if (!finalMemberId && dto.email_member) {
      const existing = await this.firestore.findOne(
        'users',
        (u) => u.email.toLowerCase() === dto.email_member!.toLowerCase(),
      );
      if (existing) finalMemberId = existing.id;
    }

    if (finalMemberId === user.id) {
      throw new BadRequestException('You are already a member of this board');
    }

    if (finalMemberId && Array.isArray(board.members) && board.members.includes(finalMemberId)) {
      throw new BadRequestException('User is already a member of this board');
    }

    // Avoid stacking duplicate pending invitations for the same person
    const duplicate = await this.firestore.findOne(
      'invitations',
      (i) =>
        i.boardId === board.id &&
        i.status === 'pending' &&
        ((Boolean(finalMemberId) && i.member_id === finalMemberId) ||
          (Boolean(dto.email_member) &&
            i.email_member &&
            i.email_member.toLowerCase() === dto.email_member!.toLowerCase())),
    );
    if (duplicate) {
      throw new BadRequestException('An invitation is already pending for this user');
    }

    // The invitation id and its metadata are server-owned: a client must not be
    // able to pick the id, forge the inviter, or create a pre-accepted invite.
    const invitation = await this.firestore.insert('invitations', {
      id: this.firestore.shortId(),
      boardId: board.id,
      board_owner_id: board.ownerId,
      invited_by: user.id,
      member_id: finalMemberId || '',
      email_member: dto.email_member ? dto.email_member.toLowerCase() : '',
      role: invitedRole,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    if (finalMemberId) {
      this.events.emitToUser(finalMemberId, 'invitation_received', {
        id: invitation.id,
        boardId: board.id,
        boardName: board.name,
        ownerId: board.ownerId,
      });
    }

    return { success: true, invitation };
  }

  /**
   * Reachable by non-members by design, so the invitation itself is the
   * authorization: it must exist, belong to this board, be addressed to the
   * caller, and still be pending. The member added is always the caller.
   */
  async resolveInvitation(
    boardId: string,
    dto: ResolveInvitationDto,
    user: JwtUser,
    cardIdFromParams?: string,
  ) {
    const invitation = await this.firestore.findById('invitations', dto.invite_id);
    if (!invitation || invitation.boardId !== boardId) {
      throw new NotFoundException('Invitation not found');
    }

    const account = await this.firestore.findById('users', user.id);
    const addressedToCaller =
      invitation.member_id === user.id ||
      (invitation.email_member &&
        account &&
        invitation.email_member.toLowerCase() === account.email.toLowerCase());

    if (!addressedToCaller) {
      throw new ForbiddenException('This invitation is not addressed to you');
    }

    if (invitation.status !== 'pending') {
      throw new ConflictException('This invitation has already been resolved');
    }

    const newStatus = dto.status === 'declined' ? 'declined' : 'accepted';

    await this.firestore.update('invitations', invitation.id, {
      status: newStatus,
      member_id: user.id,
      resolvedAt: new Date().toISOString(),
    });

    if (newStatus === 'accepted') {
      const board = await this.firestore.findById('boards', boardId);
      if (board) {
        const membersList: string[] = board.members || [];
        if (!membersList.includes(user.id)) membersList.push(user.id);

        // Grant the role the invitation was issued with. Invitations created
        // before roles existed simply fall back to 'member'.
        const grantedRole = isAssignableRole(invitation.role) ? invitation.role : BoardRole.MEMBER;

        await this.firestore.update('boards', boardId, {
          members: membersList,
          roles: { ...(board.roles || {}), [user.id]: grantedRole },
        });
      }

      const cardId = dto.card_id || cardIdFromParams;
      if (cardId && cardId !== 'undefined') {
        const card = await this.firestore.findById('cards', cardId);
        if (card && card.boardId === boardId) {
          const cardMembers: string[] = card.list_member || [];
          if (!cardMembers.includes(user.id)) {
            cardMembers.push(user.id);
            await this.firestore.update('cards', cardId, { list_member: cardMembers });
          }
        }
      }
    }

    this.events.emitToBoard(boardId, 'invitation_resolved', {
      inviteId: invitation.id,
      memberId: user.id,
      status: newStatus,
    });

    return { success: true, status: newStatus };
  }
}
