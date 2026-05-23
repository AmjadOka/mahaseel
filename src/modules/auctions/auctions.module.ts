import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { AuctionsService } from './auctions.service';
import {
  AuctionBidsController,
  AuctionMerchantController,
} from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { AuctionsProcessor } from './auctions.processor';
import { AuctionsScheduler } from './auctions.scheduler';

import { AuctionBid } from './entities/auction-bid.entity';
import { Product } from '../products/entities/product.entity';

import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { AUCTIONS_QUEUE } from './auctions.constants';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuctionBid, Product]),
    BullModule.registerQueue({ name: AUCTIONS_QUEUE }),
    NotificationsModule,
    OrdersModule,
    WalletModule,
    PaymentsModule,
  ],
  providers: [
    AuctionsService,
    AuctionsGateway,
    AuctionsProcessor,
    AuctionsScheduler,
  ],
  controllers: [
    AuctionBidsController, // buyer-facing  /auctions/bids/*
    AuctionMerchantController, // merchant-facing /auctions/merchant/*
  ],
  exports: [AuctionsService],
})
export class AuctionsModule {}
