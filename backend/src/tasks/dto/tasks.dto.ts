import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString() @IsNotEmpty({ message: 'Task title is required' }) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() card_id?: string;
  @IsOptional() @IsArray() assignedMembers?: string[];
}

export class AssignMemberDto {
  @IsString() @IsNotEmpty({ message: 'Member ID is required' }) memberId!: string;
}

export class AttachGithubDto {
  @IsString() @IsNotEmpty({ message: 'Attachment type is required' }) type!: string;
  @IsOptional() number?: string | number;
  @IsOptional() @IsString() sha?: string;
}
