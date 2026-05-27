import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketEvent } from '../../../common/enums/socket.enum';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  afterInit() {
    this.logger.log('NotificationsGateway initialized');
  }

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (!userId) {
      client.disconnect();
      return;
    }
    await client.join(`user:${userId}`);
    this.logger.log(`Client connected: ${client.id} → room user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendNotificationToUser(userId: string, payload: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(SocketEvent.NOTIFICATION, payload);
  }

  sendOrderUpdated(userId: string, payload: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(SocketEvent.ORDER_UPDATED, payload);
  }

  sendAuctionUpdated(userId: string, payload: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(SocketEvent.AUCTION_UPDATED, payload);
  }

  sendWalletUpdated(userId: string, payload: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(SocketEvent.WALLET_UPDATED, payload);
  }
}
