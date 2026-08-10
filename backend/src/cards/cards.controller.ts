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
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { EventsGateway } from '../common/realtime/events.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BoardAccessGuard } from '../common/guards/board-access.guard';
import { CONTENT_EDITORS } from '../common/constants/roles';
import { BoardRoles, CurrentUser, JwtUser } from '../common/decorators';

class CreateCardDto {
  @IsString() @IsNotEmpty({ message: 'Card name is required' }) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() createdAt?: string;
}

class UpdateCardDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() params?: Record<string, any>;
}

@Controller('boards/:boardId/cards')
@UseGuards(JwtAuthGuard, BoardAccessGuard)
export class CardsController {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly events: EventsGateway,
  ) {}

  // ---- Reads: available to every role, including viewers ----

  @Get()
  async getCards(@Param('boardId') boardId: string) {
    const cards = await this.firestore.find('cards', (c) => c.boardId === boardId);
    return cards.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt || new Date().toISOString(),
    }));
  }

  @Get('user/:user_id')
  async getUserCards(@Param('boardId') boardId: string, @Param('user_id') userId: string) {
    const cards = await this.firestore.find(
      'cards',
      (c) =>
        c.boardId === boardId && Array.isArray(c.list_member) && c.list_member.includes(userId),
    );
    return cards.map((c) => ({ id: c.id, name: c.name, description: c.description }));
  }

  @Get(':id')
  async getCardDetails(@Param('boardId') boardId: string, @Param('id') id: string) {
    const card = await this.loadCard(boardId, id);
    return { id: card.id, name: card.name, description: card.description };
  }

  // ---- Writes: closed to viewers ----

  @Post()
  @BoardRoles(...CONTENT_EDITORS)
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

  @Put(':id')
  @BoardRoles(...CONTENT_EDITORS)
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BoardRoles(...CONTENT_EDITORS)
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
