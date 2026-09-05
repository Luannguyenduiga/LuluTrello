import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
import { MailService } from '../mail/mail.service';
import { AdminGuard, isAdminEmail } from './admin.guard';
import { AdminService } from './admin.service';
import {
  AdminBoardRow,
  AdminMeResponse,
  AdminOverviewResponse,
  AdminTasksResponse,
  AdminUserRow,
  DeletedBoardResponse,
  DeletedTaskResponse,
  MailStatusResponse,
  MailTestResponse,
} from './dto/admin-response.dto';

/**
 * The admin console's data source. Every route needs a valid session and an
 * email listed in ADMIN_EMAILS - except /admin/me, which answers whether the
 * caller is an admin at all so the UI knows whether to offer the link.
 */
@ApiTags('Admin')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
@ApiForbiddenResponse({ description: 'The caller is not listed in ADMIN_EMAILS' })
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /** The one route open to everybody: it says whether to show the console link. */
  @Get('me')
  @ApiOperation({ summary: 'Is the caller an admin' })
  @ApiOkResponse({ type: AdminMeResponse })
  me(@CurrentUser() user: JwtUser) {
    return { isAdmin: isAdminEmail(this.config, user.email), email: user.email };
  }

  /** Counts, progress and today's movement across every board. */
  @Get('overview')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Dashboard figures' })
  @ApiOkResponse({ type: AdminOverviewResponse })
  overview() {
    return this.admin.overview();
  }

  /** Everyone who has signed in, busiest first. */
  @Get('users')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Every account, with its workload' })
  @ApiOkResponse({ type: [AdminUserRow] })
  users() {
    return this.admin.users();
  }

  /** Every board with its progress, busiest first. */
  @Get('boards')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Every board, with its progress' })
  @ApiOkResponse({ type: [AdminBoardRow] })
  boards() {
    return this.admin.boards();
  }

  /** Filtered task list. Overdue first, then by deadline; capped at 200 rows. */
  @Get('tasks')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Tasks across every board' })
  @ApiQuery({ name: 'boardId', required: false, description: 'Only this board' })
  @ApiQuery({ name: 'status', required: false, example: 'On Going' })
  @ApiQuery({ name: 'assignee', required: false, description: 'Account id of an assignee' })
  @ApiQuery({
    name: 'overdue',
    required: false,
    description: 'Pass `true` to keep only overdue tasks',
    example: 'true',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Substring of the title' })
  @ApiOkResponse({ type: AdminTasksResponse })
  tasks(
    @Query('boardId') boardId?: string,
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('overdue') overdue?: string,
    @Query('search') search?: string,
  ) {
    return this.admin.tasks({
      boardId,
      status,
      assignee,
      overdue: overdue === 'true',
      search,
    });
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete any task' })
  @ApiParam({ name: 'id', description: 'Task id' })
  @ApiOkResponse({ type: DeletedTaskResponse })
  @ApiNotFoundResponse({ description: 'No such task' })
  deleteTask(@Param('id') id: string) {
    return this.admin.deleteTask(id);
  }

  /** Removes the board together with its cards and tasks. */
  @Delete('boards/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete any board and its content' })
  @ApiParam({ name: 'id', description: 'Board id' })
  @ApiOkResponse({ type: DeletedBoardResponse })
  @ApiNotFoundResponse({ description: 'No such board' })
  deleteBoard(@Param('id') id: string) {
    return this.admin.deleteBoard(id);
  }

  /**
   * Which transport the running server actually has, and what is wrong with it.
   * Answers "the app says the code was sent but nothing arrives" without
   * needing access to the host's log stream.
   */
  @Get('mail/status')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'What the mail transport is, and what is wrong with it' })
  @ApiOkResponse({ type: MailStatusResponse })
  async mailStatus() {
    // Re-asked on every call rather than served from the boot-time result: an
    // account can be disabled (or re-enabled) long after the server started.
    await this.mail.checkBrevoRelay();
    return this.mail.getStatus();
  }

  /**
   * Sends a real message to `to` (defaults to the caller) and reports what the
   * provider said. A failure here carries the provider's own explanation -
   * unverified sender, bad key, unactivated account.
   */
  @Post('mail/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Send a test email' })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Recipient. Defaults to the caller.',
    example: 'lan@example.com',
  })
  @ApiOkResponse({
    description: 'Whether it went out. A failure is reported here, not as an error status.',
    type: MailTestResponse,
  })
  @ApiBadRequestResponse({ description: 'No usable recipient' })
  async mailTest(@CurrentUser() user: JwtUser, @Query('to') to?: string) {
    const recipient = (to || user.email || '').trim();
    if (!recipient.includes('@')) {
      throw new BadRequestException('Provide ?to=<email>');
    }

    const status = this.mail.getStatus();
    try {
      const sent = await this.mail.sendTestEmail(recipient);
      return sent
        ? { success: true, to: recipient, channel: status.channel }
        : {
            success: false,
            to: recipient,
            channel: status.channel,
            error: 'No mail transport is configured, so nothing was sent',
            problems: status.problems,
          };
    } catch (error: any) {
      return {
        success: false,
        to: recipient,
        channel: status.channel,
        error: error.message,
        problems: status.problems,
      };
    }
  }
}
