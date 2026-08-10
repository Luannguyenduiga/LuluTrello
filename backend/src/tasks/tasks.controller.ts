import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { EventsGateway } from '../common/realtime/events.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CardInBoardGuard } from '../common/guards/card-in-board.guard';
import { TaskInBoardGuard } from '../common/guards/task-in-board.guard';
import { CONTENT_EDITORS } from '../common/constants/roles';
import { BoardRoles, CurrentBoard, CurrentTask, CurrentUser, JwtUser } from '../common/decorators';
import { AssignMemberDto, AttachGithubDto, CreateTaskDto, UpdateTaskDto } from './dto/tasks.dto';

interface TaskAttachment {
  attachmentId: string;
  type: string;
  number: string | number | null;
  sha: string | null;
}

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
      attachments: t.attachments || [],
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
    };
  }

  @Get(':taskId/assign')
  @UseGuards(TaskInBoardGuard)
  getAssignedMembers(@Param('taskId') taskId: string, @CurrentTask() task: DocumentData) {
    const assigned: string[] = task.assignedMembers || [];
    return assigned.map((memberId) => ({ taskId, memberId }));
  }

  @Get(':taskId/github-attachments')
  @UseGuards(TaskInBoardGuard)
  getGithubAttachments(@CurrentTask() task: DocumentData): TaskAttachment[] {
    return task.attachments || [];
  }

  // ---- Writes: closed to viewers ----

  @Post()
  @BoardRoles(...CONTENT_EDITORS)
  async createTask(
    @Param('boardId') boardId: string,
    @Param('id') cardId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtUser,
  ) {
    const created = await this.firestore.insert('tasks', {
      cardId,
      boardId,
      ownerId: user.id,
      title: dto.title,
      description: dto.description || '',
      status: dto.status || 'Icebox',
      assignedMembers: [],
      attachments: [],
      createdAt: new Date().toISOString(),
    });

    this.events.emitToBoard(boardId, 'task_created', created);

    return {
      id: created.id,
      cardId: created.cardId,
      ownerId: created.ownerId,
      title: created.title,
      description: created.description,
      status: created.status,
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
    @CurrentTask() task: DocumentData,
    @CurrentBoard() board: DocumentData,
  ) {
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

    const updated = await this.firestore.update('tasks', taskId, {
      title: dto.title !== undefined ? dto.title : task.title,
      description: dto.description !== undefined ? dto.description : task.description,
      status: dto.status !== undefined ? dto.status : task.status,
      cardId: targetCardId,
      assignedMembers:
        dto.assignedMembers !== undefined ? dto.assignedMembers : task.assignedMembers || [],
    });

    this.events.emitToBoard(boardId, 'task_updated', updated);

    return { id: updated.id, cardId: updated.cardId };
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async deleteTask(@Param('boardId') boardId: string, @Param('taskId') taskId: string) {
    await this.firestore.delete('tasks', taskId);
    this.events.emitToBoard(boardId, 'task_deleted', { id: taskId });
  }

  @Post(':taskId/assign')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async assignMember(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AssignMemberDto,
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
    return { taskId, memberId: dto.memberId };
  }

  @Delete(':taskId/assign/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async removeMemberAssignment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Param('memberId') memberId: string,
    @CurrentTask() task: DocumentData,
  ) {
    const current: string[] = task.assignedMembers || [];
    const assigned = current.filter((id) => id !== memberId);
    await this.firestore.update('tasks', taskId, { assignedMembers: assigned });

    this.events.emitToBoard(boardId, 'task_assignee_removed', { taskId, memberId });
  }

  @Post(':taskId/github-attach')
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async attachGithubResource(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AttachGithubDto,
    @CurrentTask() task: DocumentData,
  ) {
    if (!dto.number && !dto.sha) {
      throw new BadRequestException('Attachment reference (number or sha) is required');
    }

    const attachments: TaskAttachment[] = task.attachments || [];
    const attachmentId = this.firestore.shortId();
    const newAttachment: TaskAttachment = {
      attachmentId,
      type: dto.type,
      number: dto.number ?? null,
      sha: dto.sha ?? null,
    };

    attachments.push(newAttachment);
    await this.firestore.update('tasks', taskId, { attachments });

    this.events.emitToBoard(boardId, 'task_attachment_added', {
      taskId,
      attachment: newAttachment,
    });

    return { taskId, attachmentId, type: dto.type, number: dto.number || dto.sha };
  }

  @Delete(':taskId/github-attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @UseGuards(TaskInBoardGuard)
  async removeGithubAttachment(
    @Param('boardId') boardId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentTask() task: DocumentData,
  ) {
    const current: TaskAttachment[] = task.attachments || [];
    const attachments = current.filter((a) => a.attachmentId !== attachmentId);
    await this.firestore.update('tasks', taskId, { attachments });

    this.events.emitToBoard(boardId, 'task_attachment_removed', { taskId, attachmentId });
  }

  /** Only people who actually belong to this board can be assigned */
  private assertBoardMembers(board: DocumentData, memberIds: string[]): void {
    const allowed = new Set<string>([board.ownerId, ...(board.members || [])]);
    if (memberIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('Cannot assign a user who is not a board member');
    }
  }
}
