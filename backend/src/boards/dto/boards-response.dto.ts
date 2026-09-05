import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ASSIGNABLE_ROLES, BoardRole } from '../../common/constants/roles';

export class BoardCreatedResponse {
  @ApiProperty({ example: 'b_9Zx8Yw7V' })
  id!: string;

  @ApiProperty({ example: 'Marketing Q3' })
  name!: string;

  @ApiPropertyOptional({ example: 'Campaign planning and launch checklist' })
  description?: string;
}

export class BoardSummaryResponse extends BoardCreatedResponse {
  @ApiProperty({ description: 'Account id of the board owner', example: 'u_7Fq2K1xZ' })
  ownerId!: string;

  @ApiProperty({
    description: 'Everyone with access, the owner excluded',
    type: [String],
    example: ['u_2Bc3De4F'],
  })
  members!: string[];
}

export class BoardDetailsResponse extends BoardSummaryResponse {
  @ApiProperty({
    description: 'Role per member id. A member missing here counts as `member`.',
    type: 'object',
    additionalProperties: { type: 'string', enum: ASSIGNABLE_ROLES },
    example: { u_2Bc3De4F: 'leader' },
  })
  roles!: Record<string, BoardRole>;

  @ApiProperty({
    description: "The caller's own role, so the client can hide what they may not do.",
    enum: BoardRole,
    example: BoardRole.OWNER,
  })
  role!: BoardRole;

  @ApiProperty({
    description: 'Whether the Zalo bot reports on this board. Owner-only setting.',
    example: false,
  })
  zaloEnabled!: boolean;
}

export class BoardSettingsResponse extends BoardCreatedResponse {
  @ApiProperty({ example: false })
  zaloEnabled!: boolean;
}

export class InvitationResponse {
  @ApiProperty({ example: 'inv_3Kd9La0P' })
  id!: string;

  @ApiProperty({ example: 'b_9Zx8Yw7V' })
  boardId!: string;

  @ApiProperty({ example: 'u_7Fq2K1xZ' })
  board_owner_id!: string;

  @ApiProperty({ description: 'Who sent the invitation', example: 'u_7Fq2K1xZ' })
  invited_by!: string;

  @ApiProperty({
    description: 'Empty when the invitation was addressed to an email instead',
    example: 'u_2Bc3De4F',
  })
  member_id!: string;

  @ApiProperty({ description: 'Empty when the invitation named an account id', example: '' })
  email_member!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: BoardRole.MEMBER })
  role!: BoardRole;

  @ApiProperty({ enum: ['pending', 'accepted', 'declined'], example: 'pending' })
  status!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;
}

/** An invitation waiting for the caller, with the board and owner resolved. */
export class PendingInvitationResponse extends InvitationResponse {
  @ApiProperty({ example: 'Marketing Q3' })
  boardName!: string;

  @ApiProperty({ example: 'Lan Nguyen' })
  ownerName!: string;
}

export class InviteMemberResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: InvitationResponse })
  invitation!: InvitationResponse;
}

export class RemoveMemberResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'u_2Bc3De4F' })
  memberId!: string;
}

export class ResolveInvitationResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ enum: ['accepted', 'declined'], example: 'accepted' })
  status!: string;
}
