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
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
import { MailService } from '../mail/mail.service';
import { AdminGuard, isAdminEmail } from './admin.guard';
import { AdminService } from './admin.service';

/**
 * The admin console's data source. Every route needs a valid session and an
 * email listed in ADMIN_EMAILS - except /admin/me, which answers whether the
 * caller is an admin at all so the UI knows whether to offer the link.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return { isAdmin: isAdminEmail(this.config, user.email), email: user.email };
  }

  @Get('overview')
  @UseGuards(AdminGuard)
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  @UseGuards(AdminGuard)
  users() {
    return this.admin.users();
  }

  @Get('boards')
  @UseGuards(AdminGuard)
  boards() {
    return this.admin.boards();
  }

  @Get('tasks')
  @UseGuards(AdminGuard)
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
  deleteTask(@Param('id') id: string) {
    return this.admin.deleteTask(id);
  }

  /** Removes the board together with its cards and tasks. */
  @Delete('boards/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
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
