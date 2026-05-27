import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './entities/notification.entity';

import { NotificationsController } from './notifications.controller';
import { NotificationCreatedListener } from './listeners/notifications.listener';
import { NotificationsGateway } from './gateways/notifications.gateway';
import { NotificationsService } from './services/notifications.service';
import { NotificationsDispatcher } from './services/notifications-dispatcher.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsScheduler } from './notifications.scheduler';
import { BullModule } from '@nestjs/bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsSseService } from './services/notifications-sse.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsScheduler,
    NotificationsProcessor,
    NotificationsService,
    NotificationsDispatcher,
    NotificationCreatedListener,
    NotificationsSseService,
    NotificationsGateway,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
