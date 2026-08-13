import { IsArray, IsISO8601, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * The deadline is stored as an ISO 8601 instant, never as the wall-clock text the
 * date picker shows: members read the same board from different time zones. The
 * form sends `""` to mean "no deadline", so blanks skip the format check.
 */
const IsOptionalDueDate = () => (target: object, key: string) => {
  ValidateIf((o: Record<string, unknown>) => o[key] != null && o[key] !== '')(target, key);
  IsISO8601({}, { message: 'dueDate must be an ISO 8601 date' })(target, key);
};

export class CreateTaskDto {
  @IsString() @IsNotEmpty({ message: 'Task title is required' }) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptionalDueDate() dueDate?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() card_id?: string;
  @IsOptional() @IsArray() assignedMembers?: string[];
  @IsOptionalDueDate() dueDate?: string;
}

export class AssignMemberDto {
  @IsString() @IsNotEmpty({ message: 'Member ID is required' }) memberId!: string;
}

export class AddAttachmentDto {
  @IsString() @IsNotEmpty({ message: 'File name is required' }) name!: string;
  @IsOptional() size?: number;
  @IsOptional() @IsString() type?: string;
  @IsString() @IsNotEmpty({ message: 'File content URL is required' }) url!: string;
}

export class AddCommentDto {
  @IsString() @IsNotEmpty({ message: 'Comment text cannot be empty' }) text!: string;
}
