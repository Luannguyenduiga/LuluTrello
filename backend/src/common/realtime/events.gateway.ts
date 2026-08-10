import { Logger } from '@nestjs/common';
import {
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(socket: Socket): void {
    this.logger.log(`Socket connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket): void {
    this.logger.log(`Socket disconnected: ${socket.id}`);
  }

  // join/leave return a promise with clustered adapters, so they are awaited:
  // dropping it would silently lose room membership under a Redis adapter.
  @SubscribeMessage('join_board')
  async handleJoinBoard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { boardId: string },
  ) {
    await socket.join(`board_${body.boardId}`);
    this.logger.log(`Socket ${socket.id} joined board room: board_${body.boardId}`);
  }

  @SubscribeMessage('leave_board')
  async handleLeaveBoard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { boardId: string },
  ) {
    await socket.leave(`board_${body.boardId}`);
    this.logger.log(`Socket ${socket.id} left board room: board_${body.boardId}`);
  }

  @SubscribeMessage('join_user')
  async handleJoinUser(@ConnectedSocket() socket: Socket, @MessageBody() body: { userId: string }) {
    await socket.join(`user_${body.userId}`);
    this.logger.log(`Socket ${socket.id} joined user notification room: user_${body.userId}`);
  }

  /** Broadcast an event to everyone watching a board */
  emitToBoard(boardId: string, event: string, payload: unknown): void {
    this.server?.to(`board_${boardId}`).emit(event, payload);
  }

  /** Broadcast an event to a single user's notification room */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user_${userId}`).emit(event, payload);
  }
}
