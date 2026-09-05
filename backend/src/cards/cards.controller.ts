import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
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
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { EventsGateway } from '../common/realtime/events.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CONTENT_EDITORS } from '../common/constants/roles';
import { BoardRoles, CurrentUser, JwtUser } from '../common/decorators';
import { CreateCardDto, UpdateCardDto } from './dto/cards.dto';
import { CardListItemResponse, CardResponse } from './dto/cards-response.dto';

@ApiTags('Cards')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'boardId', description: 'Board the cards belong to' })
@ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
@ApiForbiddenResponse({ description: 'The caller is not a member of this board' })
@Controller('boards/:boardId/cards')
@UseGuards(JwtAuthGuard, BoardAccessGuard)
export class CardsController {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly events: EventsGateway,
  ) {}

  // ---- Reads: available to every role, including viewers ----

  /** Every column of the board. Readable by every role, viewers included. */
  @Get()
  @ApiOperation({ summary: 'List the cards of a board' })
  @ApiOkResponse({ type: [CardListItemResponse] })
  async getCards(@Param('boardId') boardId: string) {
    const cards = await this.firestore.find('cards', (c) => c.boardId === boardId);
    return cards.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt || new Date().toISOString(),
    }));
  }

  /** The cards of this board that list the given account in `list_member`. */
  @Get('user/:user_id')
  @ApiOperation({ summary: 'Cards one member belongs to' })
  @ApiParam({ name: 'user_id', description: 'Account id to filter by' })
  @ApiOkResponse({ type: [CardResponse] })
  async getUserCards(@Param('boardId') boardId: string, @Param('user_id') userId: string) {
    const cards = await this.firestore.find(
      'cards',
      (c) =>
        c.boardId === boardId && Array.isArray(c.list_member) && c.list_member.includes(userId),
    );
    return cards.map((c) => ({ id: c.id, name: c.name, description: c.description }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One card' })
  @ApiParam({ name: 'id', description: 'Card id' })
  @ApiOkResponse({ type: CardResponse })
  @ApiNotFoundResponse({ description: 'No such card in this board' })
  async getCardDetails(@Param('boardId') boardId: string, @Param('id') id: string) {
    const card = await this.loadCard(boardId, id);
    return { id: card.id, name: card.name, description: card.description };
  }

  /** Adds a column. Closed to viewers. */
  @Post()
  @BoardRoles(...CONTENT_EDITORS)
  @ApiOperation({ summary: 'Create a card' })
  @ApiCreatedResponse({ type: CardResponse })
  @ApiForbiddenResponse({ description: 'Viewers cannot change board content' })
  async createCard(
    @Param('boardId') boardId: string,
    @Body() dto: CreateCardDto,
    @CurrentUser() user: JwtUser,
  ) {
    const created = await this.firestore.insert('cards', {
      boardId,
      name: dto.name,
      description: dto.description || '',
      list_member: [user.id],
      createdAt: dto.createdAt || new Date().toISOString(),
    });

    this.events.emitToBoard(boardId, 'card_created', {
      id: created.id,
      name: created.name,
      description: created.description,
    });

    return { id: created.id, name: created.name, description: created.description };
  }

  /** Only the fields present in the body are changed. Closed to viewers. */
  @Put(':id')
  @BoardRoles(...CONTENT_EDITORS)
  @ApiOperation({ summary: 'Update a card' })
  @ApiParam({ name: 'id', description: 'Card id' })
  @ApiOkResponse({ type: CardResponse })
  @ApiNotFoundResponse({ description: 'No such card in this board' })
  @ApiForbiddenResponse({ description: 'Viewers cannot change board content' })
  async updateCardDetails(
    @Param('boardId') boardId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCardDto,
  ) {
    const card = await this.loadCard(boardId, id);

    const updated = await this.firestore.update('cards', id, {
      name: dto.name || card.name,
      description: dto.description !== undefined ? dto.description : card.description,
      params: dto.params || card.params || {},
    });

    this.events.emitToBoard(boardId, 'card_updated', {
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });

    return { id: updated.id, name: updated.name, description: updated.description };
  }

  /** Deletes the card and every task that lived in it. Closed to viewers. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
  @ApiOperation({ summary: 'Delete a card and its tasks' })
  @ApiParam({ name: 'id', description: 'Card id' })
  @ApiNoContentResponse({ description: 'Card and its tasks are gone' })
  @ApiNotFoundResponse({ description: 'No such card in this board' })
  @ApiForbiddenResponse({ description: 'Viewers cannot change board content' })
  async deleteCard(@Param('boardId') boardId: string, @Param('id') id: string) {
    await this.loadCard(boardId, id);
    await this.firestore.delete('cards', id);

    // Clean up the tasks that lived in this column
    const cardTasks = await this.firestore.find('tasks', (t) => t.cardId === id);
    await Promise.all(cardTasks.map((t) => this.firestore.delete('tasks', t.id)));

    this.events.emitToBoard(boardId, 'card_deleted', { id });
  }

  /** A card id from another board must never resolve through this board's URL */
  private async loadCard(boardId: string, id: string): Promise<DocumentData> {
    const card = await this.firestore.findById('cards', id);
    if (!card || card.boardId !== boardId) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }
}
