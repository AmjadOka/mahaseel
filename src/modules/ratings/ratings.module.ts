import { Module } from '@nestjs/common';
import { Rating, RatingFlag } from './entities/rating.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rating, RatingFlag]),
    OrdersModule,
    UsersModule,
    NotificationsModule,
  ],
  providers: [RatingsService],
  controllers: [RatingsController],
  exports: [RatingsService],
})
export class RatingsModule {}
