import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

/** Documents the shared deadline field, which no plain decorator describes. */
const ApiDueDate = () =>
  ApiPropertyOptional({
    description: 'ISO 8601 instant. Send `""` to clear it. Only the owner and leaders may set it.',
    format: 'date-time',
    example: '2026-03-01T09:00:00.000Z',
  });

export class CreateTaskDto {
  @ApiProperty({ example: 'Draft the launch email' })
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  title!: string;

  @ApiPropertyOptional({ example: 'Two paragraphs, link to the landing page' })
  @IsOptional()
  @IsString()
  description?: string;

  /** Free text; the board uses Icebox / Backlog / Ongoing / Waiting / Done. */
  @ApiPropertyOptional({ example: 'Icebox', default: 'Icebox' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiDueDate()
  @IsOptionalDueDate()
  dueDate?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Draft the launch email' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** Moving a task to `Done` is what stamps its completion time. */
  @ApiPropertyOptional({ example: 'Done' })
  @IsOptional()
  @IsString()
  status?: string;

  /** Set when dragging the task to another column of the same board. */
  @ApiPropertyOptional({ description: 'Destination card id', example: 'c_1Ab2Cd3E' })
  @IsOptional()
  @IsString()
  card_id?: string;

  /** Replaces the assignee list wholesale; everybody listed must be a board member. */
  @ApiPropertyOptional({ type: [String], example: ['u_2Bc3De4F'] })
  @IsOptional()
  @IsArray()
  assignedMembers?: string[];

  @ApiDueDate()
  @IsOptionalDueDate()
  dueDate?: string;
}

export class AssignMemberDto {
  @ApiProperty({
    description: 'Account id, which must belong to this board',
    example: 'u_2Bc3De4F',
  })
  @IsString()
  @IsNotEmpty({ message: 'Member ID is required' })
  memberId!: string;
}

/**
 * Registering a file the client uploaded elsewhere. The usual path is the
 * multipart POST on the same route, which fills these fields in itself.
 */
export class AddAttachmentDto {
  @ApiProperty({ example: 'brief.pdf' })
  @IsString()
  @IsNotEmpty({ message: 'File name is required' })
  name!: string;

  @ApiPropertyOptional({ description: 'Bytes', example: 182_344 })
  @IsOptional()
  size?: number;

  @ApiPropertyOptional({ description: 'MIME type', example: 'application/pdf' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ format: 'uri', example: 'https://files.example.com/brief.pdf' })
  @IsString()
  @IsNotEmpty({ message: 'File content URL is required' })
  url!: string;
}

export class AddCommentDto {
  @ApiProperty({ example: 'Sent the draft over, waiting on review.' })
  @IsString()
  @IsNotEmpty({ message: 'Comment text cannot be empty' })
  text!: string;
}
