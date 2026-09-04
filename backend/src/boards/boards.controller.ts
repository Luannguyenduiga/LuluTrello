import {
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
import { BoardsService } from './boards.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { BoardRole } from '../common/constants/roles';
import {
  BoardRoles,
  CurrentBoard,
  CurrentBoardRole,
  CurrentUser,
  JwtUser,
} from '../common/decorators';
import { DocumentData } from '../common/firestore/firestore.service';
import {
  CreateBoardDto,
  InviteMemberDto,
  ResolveInvitationDto,
  UpdateBoardDto,
} from './dto/boards.dto';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  createBoard(@Body() dto: CreateBoardDto, @CurrentUser() user: JwtUser) {
    return this.boardsService.createBoard(dto, user);
  }

  @Get()
  getBoards(@CurrentUser() user: JwtUser) {
    return this.boardsService.getBoards(user);
  }

  // Declared before ':id' so it is not swallowed by the board-detail route
  @Get('invitations/pending')
  getPendingInvitations(@CurrentUser() user: JwtUser) {
    return this.boardsService.getPendingInvitations(user);
  }

  // Accept or decline an invitation. Deliberately NOT behind BoardAccessGuard:
  // the invitee is not a member yet. Ownership is verified in the service.
  @Post(':boardId/cards/:id/invite/accept')
  @HttpCode(HttpStatus.OK)
  resolveCardInvitation(
    @Param('boardId') boardId: string,
    @Param('id') cardId: string,
    @Body() dto: ResolveInvitationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.resolveInvitation(boardId, dto, user, cardId);
  }

  @Post(':boardId/invite/accept')
  @HttpCode(HttpStatus.OK)
  resolveInvitation(
    @Param('boardId') boardId: string,
    @Body() dto: ResolveInvitationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.resolveInvitation(boardId, dto, user);
  }

  // Everyone except viewers may invite
  @Post(':boardId/invite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER, BoardRole.MEMBER)
  inviteMember(
    @CurrentBoard() board: DocumentData,
    @CurrentBoardRole() role: BoardRole,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.inviteMember(board, role, dto, user);
  }

  // Removing someone from the workspace - owner and leaders.
  // Which of them may remove which member is decided in the service.
  @Delete(':boardId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER)
  removeMember(
    @CurrentBoard() board: DocumentData,
    @CurrentBoardRole() role: BoardRole,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.removeMember(board, role, memberId, user);
  }

  @Get(':id')
  @UseGuards(BoardAccessGuard)
  getBoardDetails(@CurrentBoard() board: DocumentData, @CurrentBoardRole() role: BoardRole) {
    return this.boardsService.getBoardDetails(board, role);
  }

  // Board settings - owner and leaders
  @Put(':id')
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER)
  updateBoardDetails(
    @CurrentBoard() board: DocumentData,
    @CurrentBoardRole() role: BoardRole,
    @Body() dto: UpdateBoardDto,
  ) {
    // The role goes through because one setting - the Zalo opt-in - is the
    // owner's alone, which BoardRoles here cannot express on its own.
    return this.boardsService.updateBoardDetails(board, dto, role);
  }

  // Deleting the whole workspace - owner only
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER)
  deleteBoard(@CurrentBoard() board: DocumentData) {
    return this.boardsService.deleteBoard(board);
  }
}
