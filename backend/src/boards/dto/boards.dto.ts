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
  @IsString()
  @IsNotEmpty({ message: 'Board name is required' })
  name!: string;

  @IsOptional() @IsString() description?: string;
}

export class UpdateBoardDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;

  /**
   * Lets the Zalo bot watch this board and include it in the group's daily
   * report. Owner-only - the service rejects it from anybody else, so a leader
   * cannot publish somebody's private board to a chat.
   */
  @IsOptional() @IsBoolean() zaloEnabled?: boolean;
}

/**
 * The invite form leaves the fields it does not use blank, so a client may send
 * `""` here. `@IsOptional()` only skips null/undefined, which would make a blank
 * field fail its format check -- `@ValidateIf` skips blanks too. The service
 * already treats `""` as "not provided", so blanks need no further normalising.
 */
export class InviteMemberDto {
  @ValidateIf((o: InviteMemberDto) => o.member_id != null && o.member_id !== '')
  @IsString()
  member_id?: string;

  @ValidateIf((o: InviteMemberDto) => o.email_member != null && o.email_member !== '')
  @IsEmail({}, { message: 'email_member must be a valid email' })
  email_member?: string;

  @ValidateIf((o: InviteMemberDto) => o.role != null && o.role !== ('' as BoardRole))
  @IsIn(ASSIGNABLE_ROLES, { message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` })
  role?: BoardRole;
}

export class ResolveInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'Invitation id is required' })
  invite_id!: string;

  @IsOptional() @IsString() card_id?: string;

  @IsOptional() @IsIn(['accepted', 'declined']) status?: 'accepted' | 'declined';
}
