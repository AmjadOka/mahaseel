import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NotificationCreatedEvent } from '../events/notification-created.event';
import { NotificationChannel } from 'src/common/enums/notification.enum';
import { NotificationsDispatcher } from '../services/notifications-dispatcher.service';
import { NotificationsSseService } from '../services/notifications-sse.service';
import { NotificationsService } from '../services/notifications.service';

export const NOTIFICATION_CREATED = 'notification.created';

@Injectable()
export class NotificationCreatedListener {
  private readonly logger = new Logger(NotificationCreatedListener.name);

  constructor(
    private readonly dispatcher: NotificationsDispatcher,
    private readonly sseService: NotificationsSseService,

    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Single handler for every 'notification.created' event.
   *
   * Responsibilities (in order):
   *  1. Delegate to the dispatcher — persist + channel dispatch.
   *  2. Bust the Redis unread cache then re-warm it via countUnread().
   *  3. Push an SSE event to any open browser tabs (IN_APP channel only).
   */
  @OnEvent(NOTIFICATION_CREATED, { async: true })
  async handle(event: NotificationCreatedEvent): Promise<void> {
    // ── 1. Persist + channel dispatch ────────────────────────────────────────
    const notification = await this.dispatcher.dispatch(event);

    // ── 2. Bust + re-warm unread cache ────────────────────────────────────────
    // bustUnread() is private in NotificationsService — markAsRead() already
    // calls it internally. For the new-notification path we bust manually then
    // call countUnread() which: cache miss → DB query → re-caches the fresh count.
    await this.notificationsService.bustUnreadForUser(event.userId);

    // ── 3. Push SSE (IN_APP channel only) ─────────────────────────────────────
    if (!event.channels.includes(NotificationChannel.IN_APP)) return;

    // countUnread() re-warms the cache as a side effect — no extra DB call needed
    const count = await this.notificationsService.countUnread(event.userId);

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
