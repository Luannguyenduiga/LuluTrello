import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { EventsGateway } from '../common/realtime/events.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CardInBoardGuard } from '../common/guards/card-in-board.guard';
import { TaskInBoardGuard } from '../common/guards/task-in-board.guard';
import { BOARD_MANAGERS, BoardRole, CONTENT_EDITORS } from '../common/constants/roles';
import {
  BoardRoles,
  CurrentBoard,
  CurrentBoardRole,
  CurrentTask,
  CurrentUser,
  JwtUser,
} from '../common/decorators';
import { AddCommentDto, AssignMemberDto, CreateTaskDto, UpdateTaskDto } from './dto/tasks.dto';
import { ZaloNotifierService } from '../zalo/zalo-notifier.service';
import { PreviewService } from '../preview/preview.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Every route requires a valid token, board membership, and a card that actually
 * belongs to that board; ':taskId' routes additionally require the task to belong
 * to that board and card. Without this a task id alone was enough to read or
 * mutate tasks across board boundaries.
 */
@Controller('boards/:boardId/cards/:id/tasks')
@UseGuards(JwtAuthGuard, BoardAccessGuard, CardInBoardGuard)
export class TasksController {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly events: EventsGateway,
    // Chat notifications are fire-and-forget: they never block or fail a request.
    private readonly zalo: ZaloNotifierService,
    private readonly preview: PreviewService,
  ) {}

  // ---- Reads: available to every role, including viewers ----

  @Get()
  async getTasks(@Param('boardId') boardId: string, @Param('id') cardId: string) {
    const tasks = await this.firestore.find(
      'tasks',
      (t) => t.cardId === cardId && t.boardId === boardId,
    );
    return tasks.map((t) => ({
      id: t.id,
      cardId: t.cardId,
      title: t.title,
      description: t.description,
      status: t.status || 'Icebox',
      assignedMembers: t.assignedMembers || [],
      dueDate: t.dueDate || null,
    }));
  }

  @Get(':taskId')
  @UseGuards(TaskInBoardGuard)
  getTaskDetails(@CurrentTask() task: DocumentData) {
    return {
      id: task.id,
      cardId: task.cardId,
      title: task.title,
      description: task.description,
      status: task.status || 'Icebox',
      dueDate: task.dueDate || null,
      attachments: task.attachments || [],
      comments: task.comments || [],
    };
  }

  @Get(':taskId/assign')
  @UseGuards(TaskInBoardGuard)
  getAssignedMembers(@Param('taskId') taskId: string, @CurrentTask() task: DocumentData) {
    const assigned: string[] = task.assignedMembers || [];
    return assigned.map((memberId) => ({ taskId, memberId }));
  }

  // ---- Writes: closed to viewers ----

  @Post()
  @BoardRoles(...CONTENT_EDITORS)
  async createTask(
    @Param('boardId') boardId: string,
    @Param('id') cardId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtUser,
    @CurrentBoardRole() callerRole: BoardRole,
  ) {
    if (dto.dueDate) this.assertMaySetDeadline(callerRole);

    const created = await this.firestore.insert('tasks', {
      cardId,
      boardId,
      ownerId: user.id,
      title: dto.title,
      description: dto.description || '',
      status: dto.status || 'Icebox',
      assignedMembers: [],
      dueDate: dto.dueDate || null,
      createdAt: new Date().toISOString(),
      // Stamped whenever a task sits in 'Done', so the evening report can count
      // what was actually finished today rather than what is merely done.
      completedAt: (dto.status || 'Icebox') === 'Done' ? new Date().toISOString() : null,
    });

    this.events.emitToBoard(boardId, 'task_created', created);
    this.zalo.taskCreated(boardId, user.id, created);

    return {
      id: created.id,
      cardId: created.cardId,
      ownerId: created.ownerId,
      title: created.title,
      description: created.description,
      status: created.status,
      dueDate: created.dueDate,
    };
  }

  @Put(':taskId')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async updateTaskDetails(
    @Param('boardId') boardId: string,
    @Param('id') cardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtUser,
    @CurrentTask() task: DocumentData,
    @CurrentBoard() board: DocumentData,
    @CurrentBoardRole() callerRole: BoardRole,
  ) {
    if (dto.dueDate !== undefined) this.assertMaySetDeadline(callerRole);

    // Determine target card (when dragging a task between columns). The
    // destination must live in the same board, otherwise a task could be pushed
    // out of the board the caller has access to.
    const targetCardId = dto.card_id || cardId;
    if (targetCardId !== cardId) {
      const targetCard = await this.firestore.findById('cards', targetCardId);
      if (!targetCard || targetCard.boardId !== boardId) {
        throw new BadRequestException('Target card does not belong to this board');
      }
    }

    if (dto.assignedMembers !== undefined) {
      this.assertBoardMembers(board, dto.assignedMembers);
    }

    const nextStatus = dto.status !== undefined ? dto.status : task.status;
    const wasDone = task.status === 'Done';
    const isDone = nextStatus === 'Done';

    const updated = await this.firestore.update('tasks', taskId, {
      title: dto.title !== undefined ? dto.title : task.title,
      description: dto.description !== undefined ? dto.description : task.description,
      status: nextStatus,
      // Set on the transition into 'Done' and cleared on the way out, so a task
      // reopened and finished again counts on the day it was finished again.
      completedAt: isDone ? (wasDone ? task.completedAt || null : new Date().toISOString()) : null,
      cardId: targetCardId,
      assignedMembers:
        dto.assignedMembers !== undefined ? dto.assignedMembers : task.assignedMembers || [],
      // An empty string is how the form clears a deadline, so it must reach
      // Firestore as null rather than being treated as "field not sent".
      dueDate: dto.dueDate !== undefined ? dto.dueDate || null : task.dueDate || null,
    });

    this.events.emitToBoard(boardId, 'task_updated', updated);
    this.zalo.taskUpdated(boardId, user.id, task, updated);

    return { id: updated.id, cardId: updated.cardId };
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...BOARD_MANAGERS)
  @UseGuards(TaskInBoardGuard)
  async deleteTask(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtUser,
    @CurrentTask() task: DocumentData,
  ) {
    await this.firestore.delete('tasks', taskId);
    this.events.emitToBoard(boardId, 'task_deleted', { id: taskId });
    this.zalo.taskDeleted(boardId, user.id, task);
  }

  @Post(':taskId/assign')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async assignMember(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AssignMemberDto,
    @CurrentUser() user: JwtUser,
    @CurrentTask() task: DocumentData,
    @CurrentBoard() board: DocumentData,
  ) {
    this.assertBoardMembers(board, [dto.memberId]);

    const assigned: string[] = task.assignedMembers || [];
    if (!assigned.includes(dto.memberId)) {
      assigned.push(dto.memberId);
      await this.firestore.update('tasks', taskId, { assignedMembers: assigned });
    }

    this.events.emitToBoard(boardId, 'task_assignee_added', { taskId, memberId: dto.memberId });
    this.zalo.memberAssigned(boardId, user.id, task, dto.memberId);
    return { taskId, memberId: dto.memberId };
  }

  @Delete(':taskId/assign/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...BOARD_MANAGERS)
  @UseGuards(TaskInBoardGuard)
  async removeMemberAssignment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtUser,
    @CurrentTask() task: DocumentData,
  ) {
    const current: string[] = task.assignedMembers || [];
    const assigned = current.filter((id) => id !== memberId);
    await this.firestore.update('tasks', taskId, { assignedMembers: assigned });

    this.events.emitToBoard(boardId, 'task_assignee_removed', { taskId, memberId });
    this.zalo.memberUnassigned(boardId, user.id, task, memberId);
  }

  /**
   * A displayable rendering of one attachment: HTML for the office formats the
   * browser cannot open by itself, a URL for the ones it can. A read, so every
   * role including viewers may ask for it.
   */
  @Get(':taskId/attachments/:attachmentId/preview')
  @UseGuards(TaskInBoardGuard)
  async previewAttachment(
    @Req() req: any,
    @Param('attachmentId') attachmentId: string,
    @CurrentTask() task: DocumentData,
  ) {
    const attachment = (task.attachments || []).find((att: any) => att.id === attachmentId);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    // The host is taken from this request rather than from the stored URL, which
    // still carries whatever host the file happened to be uploaded through.
    return this.preview.build(attachment, `${req.protocol}://${req.get('host')}`);
  }

  @Post(':taskId/attachments')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  @UseInterceptors(FileInterceptor('file'))
  async addAttachment(
    @Req() req: any,
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @UploadedFile() file: any,
    @CurrentTask() task: DocumentData,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const uploadDir = join(__dirname, '..', '..', 'uploads');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const fileId = this.firestore.generateId();
    const extension = file.originalname.split('.').pop() || '';
    const filename = `${fileId}.${extension}`;
    const filePath = join(uploadDir, filename);

    writeFileSync(filePath, file.buffer);

    const attachments = task.attachments || [];
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const newAttachment = {
      id: fileId,
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
      url: `${baseUrl}/uploads/${filename}`,
      uploadedAt: new Date().toISOString(),
    };
    attachments.push(newAttachment);
    await this.firestore.update('tasks', taskId, { attachments });

    this.events.emitToBoard(boardId, 'task_updated', { id: taskId });
    this.zalo.attachmentAdded(boardId, req.user?.id, task, file.originalname);
    return newAttachment;
  }

  @Delete(':taskId/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async removeAttachment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentTask() task: DocumentData,
  ) {
    const current = task.attachments || [];
    const target = current.find((att: any) => att.id === attachmentId);
    if (target) {
      const filename = target.url.split('/').pop();
      const filePath = join(__dirname, '..', '..', 'uploads', filename);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (err: any) {
          new Logger('TasksController').error(`Failed to delete file: ${filePath}`, err.message);
        }
      }
    }

    const attachments = current.filter((att: any) => att.id !== attachmentId);
    await this.firestore.update('tasks', taskId, { attachments });

    this.events.emitToBoard(boardId, 'task_updated', { id: taskId });
  }

  @Post(':taskId/comments')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async addComment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: JwtUser,
    @CurrentTask() task: DocumentData,
  ) {
    const author = await this.firestore.findById('users', user.id);
    if (!author) {
      throw new BadRequestException('User not found');
    }

    const comments = task.comments || [];
    const newComment = {
      id: this.firestore.generateId(),
      authorId: author.id,
      authorName: author.name,
      authorAvatarUrl: author.avatarUrl,
      text: dto.text,
      createdAt: new Date().toISOString(),
    };
    comments.push(newComment);
    await this.firestore.update('tasks', taskId, { comments });

    this.events.emitToBoard(boardId, 'task_updated', { id: taskId });
    this.zalo.commentAdded(boardId, user.id, task, dto.text);
    return newComment;
  }

  @Delete(':taskId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async removeComment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtUser,
    @CurrentBoardRole() callerRole: BoardRole,
    @CurrentTask() task: DocumentData,
  ) {
    const current = task.comments || [];
    const target = current.find((c: any) => c.id === commentId);
    if (!target) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = target.authorId === user.id;
    const isManager = callerRole === 'owner' || callerRole === 'leader';
    if (!isAuthor && !isManager) {
      throw new ForbiddenException('You do not have permission to delete this comment');
    }

    const comments = current.filter((c: any) => c.id !== commentId);
    await this.firestore.update('tasks', taskId, { comments });

    this.events.emitToBoard(boardId, 'task_updated', { id: taskId });
  }

  /**
   * A deadline is a scheduling decision rather than task content, so it stays
   * with the people who run the board: members may edit and move a task, but
   * only the owner and leaders may set or clear when it is due.
   */
  private assertMaySetDeadline(callerRole: BoardRole): void {
    if (!BOARD_MANAGERS.includes(callerRole)) {
      throw new ForbiddenException('Only the board owner or a leader can set a deadline');
    }
  }

  /** Only people who actually belong to this board can be assigned */
  private assertBoardMembers(board: DocumentData, memberIds: string[]): void {
    const allowed = new Set<string>([board.ownerId, ...(board.members || [])]);
    if (memberIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('Cannot assign a user who is not a board member');
    }
  }
}
