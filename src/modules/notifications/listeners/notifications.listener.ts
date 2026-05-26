import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification } from '../entities/notification.entity';
import { NotificationCreatedEvent } from '../events/notification-created.event';
import { NotificationChannel } from 'src/common/enums/notification.enum';
import { NotificationsSseService } from '../services/notifications-sse.service';
import { RedisService } from 'src/shared/redis/redis.service';
export const NOTIFICATION_CREATED = 'notification.created';

// Mirror of the keys in NotificationsService — kept in sync manually.
// Alternatively, export CK from notifications.service.ts and import it here.
const CK = {
  count: (userId: string) => `notifications:count:${userId}`,
  unread: (userId: string) => `notifications:unread:${userId}`,
};

@Injectable()
export class NotificationCreatedListener {
  private readonly logger = new Logger(NotificationCreatedListener.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly sseService: NotificationsSseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Fires for every 'notification.created' event emitted by NotificationsService.notify().
   *
   * Responsibilities:
   *  1. Persist the notification row to the DB (in-app bell).
   *  2. Bust the Redis unread cache so the next poll sees fresh data.
   *  3. Push a real-time SSE event to any open browser tabs.
   */
  @OnEvent(NOTIFICATION_CREATED, { async: true })
  async handle(event: NotificationCreatedEvent): Promise<void> {
    // ── 1. Persist ──────────────────────────────────────────────────────────
    await this.notificationRepo.save(
      this.notificationRepo.create({
        userId: event.userId,
        type: event.type,
        title: event.title,
        body: event.body,
        titleAr: event.titleAr,
        bodyAr: event.bodyAr,
        data: event.data,
        isRead: false,
      }),
    );

    // ── 2. Bust Redis unread cache ──────────────────────────────────────────
    await Promise.all([
      this.redis.del(CK.unread(event.userId)),
      this.redis.del(CK.count(event.userId)),
    ]);

    // ── 3. Push SSE (only for IN_APP channel) ───────────────────────────────
    if (!event.channels.includes(NotificationChannel.IN_APP)) return;

    // Fresh count from DB since we just busted the cache
    const count = await this.notificationRepo.count({
      where: { userId: event.userId, isRead: false },
    });

    this.sseService.push(event.userId, {
      count,
      type: event.type,
      title: event.title,
      body: event.body,
      titleAr: event.titleAr,
      bodyAr: event.bodyAr,
      referenceType: event.data?.referenceType,
      referenceId: event.data?.referenceId,
    });

    this.logger.debug(
      `Notification persisted + SSE pushed [userId=${event.userId}] type=${event.type}`,
    );
  }
}
