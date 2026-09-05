import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminMeResponse {
  @ApiProperty({
    description: 'Whether the caller is listed in ADMIN_EMAILS',
    example: false,
  })
  isAdmin!: boolean;

  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  email!: string;
}

class OverviewCounts {
  @ApiProperty({ example: 12 })
  users!: number;

  @ApiProperty({ example: 4 })
  boards!: number;

  @ApiProperty({ example: 16 })
  cards!: number;

  @ApiProperty({ example: 87 })
  tasks!: number;
}

class OverviewProgress {
  @ApiProperty({ example: 41 })
  done!: number;

  @ApiProperty({ description: 'Share of all tasks that are done', example: 47 })
  percent!: number;

  @ApiProperty({ description: 'Past their deadline and not done', example: 6 })
  overdue!: number;

  @ApiProperty({ description: 'Open tasks with nobody on them', example: 9 })
  unassigned!: number;
}

class OverviewToday {
  @ApiProperty({ example: 3 })
  created!: number;

  @ApiProperty({ example: 5 })
  completed!: number;
}

/** The numbers behind the admin dashboard, counted over every board. */
export class AdminOverviewResponse {
  @ApiProperty({ type: OverviewCounts })
  counts!: OverviewCounts;

  @ApiProperty({ type: OverviewProgress })
  progress!: OverviewProgress;

  @ApiProperty({ description: 'Counted in the report timezone', type: OverviewToday })
  today!: OverviewToday;

  @ApiProperty({
    description: 'Task count per status column',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { Icebox: 20, Backlog: 14, 'On Going': 8, 'Waiting for Review': 4, Done: 41 },
  })
  byStatus!: Record<string, number>;

  @ApiProperty({ description: 'IANA zone the daily counts are cut on', example: 'Asia/Bangkok' })
  timezone!: string;
}

export class AdminUserRow {
  @ApiProperty({ example: 'u_2Bc3De4F' })
  id!: string;

  @ApiProperty({ example: 'Lan Nguyen' })
  name!: string;

  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  email!: string;

  @ApiProperty({ format: 'uri', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: string | null;

  /** GitHub accounts have no code flow, which explains a missing sign-in mail. */
  @ApiProperty({ enum: ['github', 'email'], example: 'email' })
  provider!: string;

  @ApiProperty({ description: 'Boards owned or joined', example: 2 })
  boards!: number;

  @ApiProperty({ example: 7 })
  openTasks!: number;

  @ApiProperty({ example: 1 })
  overdue!: number;
}

export class AdminBoardRow {
  @ApiProperty({ example: 'b_9Zx8Yw7V' })
  id!: string;

  @ApiProperty({ example: 'Marketing Q3' })
  name!: string;

  @ApiProperty({ example: '' })
  description!: string;

  /** The owner by name, or a fragment of the id when the account is gone. */
  @ApiProperty({ example: 'Lan Nguyen' })
  owner!: string;

  @ApiProperty({ description: 'Members besides the owner', example: 3 })
  members!: number;

  @ApiProperty({ example: 4 })
  cards!: number;

  @ApiProperty({ example: 22 })
  tasks!: number;

  @ApiProperty({ example: 10 })
  done!: number;

  @ApiProperty({ example: 45 })
  percent!: number;

  @ApiProperty({ example: 2 })
  overdue!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: string | null;
}

export class AdminTaskRow {
  @ApiProperty({ example: 't_4Ef5Gh6I' })
  id!: string;

  @ApiProperty({ example: 'Draft the launch email' })
  title!: string;

  @ApiProperty({ example: 'On Going' })
  status!: string;

  @ApiProperty({ description: 'Board name', example: 'Marketing Q3' })
  board!: string;

  @ApiProperty({ example: 'b_9Zx8Yw7V' })
  boardId!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  dueDate!: string | null;

  @ApiProperty({ example: false })
  overdue!: boolean;

  @ApiProperty({ description: 'Assignees by name', type: [String], example: ['Lan Nguyen'] })
  assignees!: string[];

  @ApiProperty({ example: 2 })
  comments!: number;

  @ApiProperty({ example: 1 })
  attachments!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;
}

/** Overdue first, then by deadline. At most 200 rows come back. */
export class AdminTasksResponse {
  @ApiProperty({ description: 'Matches before the 200-row cut', example: 348 })
  total!: number;

  @ApiProperty({ type: [AdminTaskRow] })
  rows!: AdminTaskRow[];
}

export class DeletedTaskResponse {
  @ApiProperty({ description: 'Id of the deleted task', example: 't_4Ef5Gh6I' })
  deleted!: string;
}

export class DeletedBoardResponse {
  @ApiProperty({ description: 'Id of the deleted board', example: 'b_9Zx8Yw7V' })
  deleted!: string;

  @ApiProperty({ description: 'Cards removed with it', example: 4 })
  cards!: number;

  @ApiProperty({ description: 'Tasks removed with it', example: 22 })
  tasks!: number;
}

export class MailStatusResponse {
  @ApiProperty({ enum: ['brevo', 'smtp', 'none'], example: 'brevo' })
  channel!: string;

  @ApiProperty({ description: 'Raw SMTP_FROM / SMTP_USER value', example: 'Lulu <no-reply@x.vn>' })
  from!: string;

  @ApiProperty({ format: 'email', example: 'no-reply@x.vn' })
  senderEmail!: string;

  /** False when the sender is missing or is not an address - providers reject those. */
  @ApiProperty({ example: true })
  senderUsable!: boolean;

  /**
   * Brevo's own view of whether it will actually relay. `null` until the check
   * has run, or when Brevo is not the channel.
   */
  @ApiProperty({ nullable: true, example: true })
  brevoRelayEnabled!: boolean | null;

  @ApiProperty({ description: 'Everything wrong with the current setup', type: [String] })
  problems!: string[];
}

export class MailTestResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  to!: string;

  @ApiProperty({ enum: ['brevo', 'smtp', 'none'], example: 'brevo' })
  channel!: string;

  /** Present on a failure: what the provider said, or that nothing is configured. */
  @ApiPropertyOptional({ example: 'No mail transport is configured, so nothing was sent' })
  error?: string;

  @ApiPropertyOptional({ type: [String] })
  problems?: string[];
}
