import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: '*' },
})
export class AuctionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Client joins a product auction room to receive live bid updates */
  @SubscribeMessage('join_auction')
  handleJoin(
    @MessageBody() data: { productId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`auction:${data.productId}`);
    this.logger.log(`Client ${client.id} joined auction:${data.productId}`);
    return { event: 'joined', room: `auction:${data.productId}` };
  }

  @SubscribeMessage('leave_auction')
  handleLeave(
    @MessageBody() data: { productId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`auction:${data.productId}`);
  }

  /** Called by AuctionsService when a new bid is placed */
  emitBidUpdate(
    productId: string,
    payload: {
      bidId?: string;
      amount?: number;
      totalBids?: number;
      currentBid?: number | null;
    },
  ) {
    this.server.to(`auction:${productId}`).emit('bid_update', {
      productId,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /** Called when auction closes */
  emitAuctionClosed(
    productId: string,
    winnerId: string | null,
    winningAmount: number | null,
  ) {
    this.server.to(`auction:${productId}`).emit('auction_closed', {
      productId,
      winnerId,
      winningAmount,
      timestamp: new Date().toISOString(),
    });
  }
}
