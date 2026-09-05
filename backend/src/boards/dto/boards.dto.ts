import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ASSIGNABLE_ROLES, BoardRole } from '../../common/constants/roles';

export class CreateBoardDto {
  @ApiProperty({ example: 'Marketing Q3' })
  @IsString()
  @IsNotEmpty({ message: 'Board name is required' })
  name!: string;

  @ApiPropertyOptional({ example: 'Campaign planning and launch checklist' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateBoardDto {
  @ApiPropertyOptional({ example: 'Marketing Q4' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Lets the Zalo bot watch this board and include it in the group's daily
   * report. Owner-only - the service rejects it from anybody else, so a leader
   * cannot publish somebody's private board to a chat.
   */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  zaloEnabled?: boolean;
}

/**
 * The invite form leaves the fields it does not use blank, so a client may send
 * `""` here. `@IsOptional()` only skips null/undefined, which would make a blank
 * field fail its format check -- `@ValidateIf` skips blanks too. The service
 * already treats `""` as "not provided", so blanks need no further normalising.
 */
export class InviteMemberDto {
  /** Invite an existing account by id. Give this or `email_member`. */
  @ApiPropertyOptional({ example: 'u_7Fq2K1xZ' })
  @ValidateIf((o: InviteMemberDto) => o.member_id != null && o.member_id !== '')
  @IsString()
  member_id?: string;

  /** Invite by email; unknown addresses get an invitation mail. */
  @ApiPropertyOptional({ format: 'email', example: 'lan@example.com' })
  @ValidateIf((o: InviteMemberDto) => o.email_member != null && o.email_member !== '')
  @IsEmail({}, { message: 'email_member must be a valid email' })
  email_member?: string;

  /** Role to grant. Defaults to the lowest assignable role when omitted. */
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, example: ASSIGNABLE_ROLES[0] })
  @ValidateIf((o: InviteMemberDto) => o.role != null && o.role !== ('' as BoardRole))
  @IsIn(ASSIGNABLE_ROLES, { message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` })
  role?: BoardRole;
}

export class ResolveInvitationDto {
  @ApiProperty({ example: 'inv_3Kd9La0P' })
  @IsString()
  @IsNotEmpty({ message: 'Invitation id is required' })
  invite_id!: string;

  /** Only for a card-level invitation, matching the id in the URL. */
  @ApiPropertyOptional({ example: 'c_1Ab2Cd3E' })
  @IsOptional()
  @IsString()
  card_id?: string;

  @ApiPropertyOptional({ enum: ['accepted', 'declined'], example: 'accepted' })
  @IsOptional()
  @IsIn(['accepted', 'declined'])
  status?: 'accepted' | 'declined';
}
