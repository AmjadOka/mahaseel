import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification } from '../entities/notification.entity';
import { NotificationCreatedEvent } from '../events/notification-created.event';
import { NotificationChannel } from 'src/common/enums/notification.enum';
import { NotificationsDispatcher } from '../services/notifications-dispatcher.service';
import { NotificationsSseService } from '../services/notifications-sse.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { NOTIFICATIONS_CK } from '../notifications.cache';

export const NOTIFICATION_CREATED = 'notification.created';

@Injectable()
export class NotificationCreatedListener {
  private readonly logger = new Logger(NotificationCreatedListener.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly dispatcher: NotificationsDispatcher,
    private readonly sseService: NotificationsSseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Single handler for every 'notification.created' event.
   *
   * Responsibilities (in order):
   *  1. Delegate to the dispatcher — persist + channel dispatch.
   *  2. Bust the Redis unread cache (count + list).
   *  3. Push an SSE event to any open browser tabs (IN_APP channel only).
   */
  @OnEvent(NOTIFICATION_CREATED, { async: true })
  async handle(event: NotificationCreatedEvent): Promise<void> {
    // ── 1. Persist + channel dispatch ────────────────────────────────────────
    // Dispatcher owns persistence — one save, guaranteed.
    const notification = await this.dispatcher.dispatch(event);

    // ── 2. Bust Redis unread cache ────────────────────────────────────────────
    await Promise.all([
      this.redis.del(NOTIFICATIONS_CK.unread(event.userId)),
      this.redis.del(NOTIFICATIONS_CK.count(event.userId)),
    ]);

    // ── 3. Push SSE (IN_APP channel only) ─────────────────────────────────────
    if (!event.channels.includes(NotificationChannel.IN_APP)) return;

    // Fresh unread count from DB — cache was just busted above
    const count = await this.notificationRepo.count({
      where: { userId: event.userId, isRead: false },
    });

    this.sseService.push(event.userId, {
      count,
      type: event.type,
      title: notification.title,
      body: notification.body,
      titleAr: notification.titleAr,
      bodyAr: notification.bodyAr,
      referenceType: notification.referenceType,
      referenceId: notification.referenceId,
    });

    this.logger.debug(
      `SSE pushed [userId=${event.userId}] type=${event.type} unread=${count}`,
    );
  }
}
