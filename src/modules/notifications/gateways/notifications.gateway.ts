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
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from 'src/modules/auth/interfaces/jwt-payload.interface';

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
  private readonly jwtService: JwtService;
  afterInit() {
    this.logger.log('NotificationsGateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload: JwtPayload = this.jwtService.verify(token);
      await client.join(`user:${payload.sub}`);
      this.logger.log(
        `Client connected: ${client.id} → room user:${payload.sub}`,
      );
    } catch {
      client.disconnect();
    }
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
