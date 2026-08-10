import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { AppRequest } from '../decorators';

/**
 * Ensures the card in the URL really belongs to the board in the URL, so a card
 * id from another board cannot be smuggled in behind an authorized board id.
 * In nested task routes the card id arrives as :id, elsewhere as :cardId.
 */
@Injectable()
export class CardInBoardGuard implements CanActivate {
  constructor(private readonly firestore: FirestoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const cardId = request.params.cardId || request.params.id;

    if (!cardId) {
      throw new NotFoundException('Card id is required');
    }

    const card = await this.firestore.findById('cards', cardId);
    if (!card || card.boardId !== request.board?.id) {
      throw new NotFoundException('Card not found in this board');
    }

    request.card = card;
    return true;
  }
}
