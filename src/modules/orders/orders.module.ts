import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersScheduler } from './orders.scheduler';
import { OrdersProcessor } from './orders.processor';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE } from './orders.constants';
import { PaymentsModule } from '../payments/payments.module';
import { AuctionBid } from '../auctions/entities/auction-bid.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, AuctionBid]),
    ProductsModule,
    NotificationsModule,
    WalletModule,
    PaymentsModule,
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
    }),
  ],
  providers: [OrdersService, OrdersProcessor, OrdersScheduler],
  controllers: [OrdersController],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
