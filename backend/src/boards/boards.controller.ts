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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import {
  BoardCreatedResponse,
  BoardDetailsResponse,
  BoardSettingsResponse,
  BoardSummaryResponse,
  InviteMemberResponse,
  PendingInvitationResponse,
  RemoveMemberResponse,
  ResolveInvitationResponse,
} from './dto/boards-response.dto';

@ApiTags('Boards')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  /** The caller becomes the owner of the new board. */
  @Post()
  @ApiOperation({ summary: 'Create a board' })
  @ApiCreatedResponse({ type: BoardCreatedResponse })
  createBoard(@Body() dto: CreateBoardDto, @CurrentUser() user: JwtUser) {
    return this.boardsService.createBoard(dto, user);
  }

  /** Every board the caller owns or is a member of. */
  @Get()
  @ApiOperation({ summary: 'List the boards the caller can see' })
  @ApiOkResponse({ type: [BoardSummaryResponse] })
  getBoards(@CurrentUser() user: JwtUser) {
    return this.boardsService.getBoards(user);
  }

  // Declared before ':id' so it is not swallowed by the board-detail route
  /** Invitations addressed to the caller by account id or by email. */
  @Get('invitations/pending')
  @ApiOperation({ summary: 'Invitations waiting for the caller' })
  @ApiOkResponse({ type: [PendingInvitationResponse] })
  getPendingInvitations(@CurrentUser() user: JwtUser) {
    return this.boardsService.getPendingInvitations(user);
  }

  // Accept or decline an invitation. Deliberately NOT behind BoardAccessGuard:
  // the invitee is not a member yet. Ownership is verified in the service.
  /**
   * Answer an invitation to one card. No board membership is required - the
   * invitee is not a member yet; the service checks the invitation is theirs.
   */
  @Post(':boardId/cards/:id/invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or decline a card invitation' })
  @ApiParam({ name: 'boardId', description: 'Board the card belongs to' })
  @ApiParam({ name: 'id', description: 'Card id' })
  @ApiOkResponse({ type: ResolveInvitationResponse })
  @ApiNotFoundResponse({ description: 'No such invitation for this caller' })
  resolveCardInvitation(
    @Param('boardId') boardId: string,
    @Param('id') cardId: string,
    @Body() dto: ResolveInvitationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.resolveInvitation(boardId, dto, user, cardId);
  }

  /** Answer an invitation to the board itself. */
  @Post(':boardId/invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or decline a board invitation' })
  @ApiOkResponse({ type: ResolveInvitationResponse })
  @ApiNotFoundResponse({ description: 'No such invitation for this caller' })
  resolveInvitation(
    @Param('boardId') boardId: string,
    @Body() dto: ResolveInvitationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.resolveInvitation(boardId, dto, user);
  }

  // Everyone except viewers may invite
  /** Invite by account id or by email. Any role except viewer may invite. */
  @Post(':boardId/invite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER, BoardRole.MEMBER)
  @ApiOperation({ summary: 'Invite somebody to the board' })
  @ApiOkResponse({ type: InviteMemberResponse })
  @ApiBadRequestResponse({ description: 'Unknown invitee, or an invitation is already pending' })
  @ApiForbiddenResponse({ description: 'Viewers cannot invite' })
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
  /**
   * Take somebody off the board and off its content. Owners and leaders only,
   * and a leader may not remove another leader or the owner.
   */
  @Delete(':boardId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER)
  @ApiOperation({ summary: 'Remove a member from the board' })
  @ApiParam({ name: 'memberId', description: 'Account id of the member to remove' })
  @ApiOkResponse({ type: RemoveMemberResponse })
  @ApiForbiddenResponse({ description: 'The caller may not remove this member' })
  removeMember(
    @CurrentBoard() board: DocumentData,
    @CurrentBoardRole() role: BoardRole,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.boardsService.removeMember(board, role, memberId, user);
  }

  /** The board with its member list, the role map, and the role of the caller. */
  @Get(':id')
  @UseGuards(BoardAccessGuard)
  @ApiOperation({ summary: 'Board details' })
  @ApiOkResponse({ type: BoardDetailsResponse })
  @ApiForbiddenResponse({ description: 'The caller is not a member of this board' })
  getBoardDetails(@CurrentBoard() board: DocumentData, @CurrentBoardRole() role: BoardRole) {
    return this.boardsService.getBoardDetails(board, role);
  }

  // Board settings - owner and leaders
  /**
   * Rename or describe the board. The Zalo opt-in belongs to the owner alone,
   * because it decides what leaves the board for a group chat.
   */
  @Put(':id')
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.LEADER)
  @ApiOperation({ summary: 'Update board settings' })
  @ApiOkResponse({ type: BoardSettingsResponse })
  @ApiForbiddenResponse({ description: 'Members and viewers, or a leader toggling Zalo' })
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
  /** Deletes the board together with its cards, tasks and invitations. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(BoardAccessGuard)
  @BoardRoles(BoardRole.OWNER)
  @ApiOperation({ summary: 'Delete a board' })
  @ApiNoContentResponse({ description: 'Board and its content are gone' })
  @ApiForbiddenResponse({ description: 'Only the owner may delete a board' })
  deleteBoard(@CurrentBoard() board: DocumentData) {
    return this.boardsService.deleteBoard(board);
  }
}
