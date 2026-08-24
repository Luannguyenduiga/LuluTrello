import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
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
}
