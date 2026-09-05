import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentResponse {
  @ApiProperty({ example: 'a_5Gh6Ij7K' })
  id!: string;

  @ApiProperty({ example: 'brief.pdf' })
  name!: string;

  @ApiProperty({ description: 'Bytes', example: 182_344 })
  size!: number;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  type!: string;

  /** Present when the file lives in R2. Internal - reach the bytes via /preview. */
  @ApiPropertyOptional({ example: 'tasks/t_4Ef5Gh6I/a_5Gh6Ij7K.pdf' })
  storageKey?: string;

  /** Present instead of `storageKey` for files kept on the server disk. */
  @ApiPropertyOptional({ format: 'uri', example: 'https://api.example.com/uploads/a_5Gh6Ij7K.pdf' })
  url?: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  uploadedAt!: string;
}

export class CommentResponse {
  @ApiProperty({ example: 'cm_8Lm9No0P' })
  id!: string;

  @ApiProperty({ example: 'u_2Bc3De4F' })
  authorId!: string;

  @ApiProperty({ example: 'Lan Nguyen' })
  authorName!: string;

  @ApiPropertyOptional({ format: 'uri' })
  authorAvatarUrl?: string;

  @ApiProperty({ example: 'Sent the draft over, waiting on review.' })
  text!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;
}

export class TaskListItemResponse {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  id!: string;

  @ApiProperty({ description: 'Column the task sits in', example: 'c_1Ab2Cd3E' })
  cardId!: string;

  @ApiProperty({ example: 'Draft the launch email' })
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ example: 'Icebox' })
  status!: string;

  @ApiProperty({ type: [String], example: ['u_2Bc3De4F'] })
  assignedMembers!: string[];

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  dueDate!: string | null;
}

export class TaskDetailsResponse {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  id!: string;

  @ApiProperty({ example: 'c_1Ab2Cd3E' })
  cardId!: string;

  @ApiProperty({ example: 'Draft the launch email' })
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ example: 'Ongoing' })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  dueDate!: string | null;

  @ApiProperty({ type: [AttachmentResponse] })
  attachments!: AttachmentResponse[];

  @ApiProperty({ type: [CommentResponse] })
  comments!: CommentResponse[];
}

/** What a create returns - a subset of the stored task. */
export class TaskCreatedResponse {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  id!: string;

  @ApiProperty({ example: 'c_1Ab2Cd3E' })
  cardId!: string;

  @ApiProperty({ description: 'Who created it', example: 'u_2Bc3De4F' })
  ownerId!: string;

  @ApiProperty({ example: 'Draft the launch email' })
  title!: string;

  @ApiProperty({ example: '' })
  description!: string;

  @ApiProperty({ example: 'Icebox' })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  dueDate!: string | null;
}

/** An update answers with the identity only; the board state arrives over the socket. */
export class TaskUpdatedResponse {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  id!: string;

  @ApiProperty({ description: 'Where the task ended up', example: 'c_1Ab2Cd3E' })
  cardId!: string;
}

export class TaskAssigneeResponse {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  taskId!: string;

  @ApiProperty({ example: 'u_2Bc3De4F' })
  memberId!: string;
}

/**
 * A displayable rendering of one attachment. `kind` says how to show it:
 * `html` carries a converted document, the others are opened from `url`.
 */
export class AttachmentPreviewResponse {
  @ApiProperty({ example: 'a_5Gh6Ij7K' })
  id!: string;

  @ApiProperty({ example: 'brief.pdf' })
  name!: string;

  @ApiProperty({ description: 'Lower-case extension', example: 'pdf' })
  format!: string;

  @ApiProperty({ enum: ['html', 'pdf', 'image', 'video', 'audio', 'unsupported'], example: 'pdf' })
  kind!: string;

  /** A full, already escaped document. Only when `kind` is `html`. */
  @ApiPropertyOptional()
  html?: string;

  /** Short-lived signed link for files in R2. */
  @ApiPropertyOptional({ format: 'uri' })
  url?: string;

  @ApiPropertyOptional({ format: 'uri' })
  downloadUrl?: string;

  /** Truncation warnings, or why there is no preview. Shown above the viewer. */
  @ApiPropertyOptional()
  note?: string;
}
