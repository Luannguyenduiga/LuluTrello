import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
}

export class InviteMemberDto {
  @IsOptional() @IsString() member_id?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email_member must be a valid email' })
  email_member?: string;

  @IsOptional()
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
