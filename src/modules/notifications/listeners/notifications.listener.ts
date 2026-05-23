import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationCreatedEvent } from '../events/notification-created.event';
import { NotificationsDispatcher } from '../services/notifications-dispatcher.service';

export const NOTIFICATION_CREATED = 'notification.created';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly dispatcher: NotificationsDispatcher) {}

  @OnEvent(NOTIFICATION_CREATED, { async: true })
  async handleNotificationCreated(event: NotificationCreatedEvent) {
    this.logger.log(
      `Handling notification [${event.type}] for user ${event.userId}`,
    );

    try {
      await this.dispatcher.dispatch(event);
    } catch (err) {
      this.logger.error(
        `Failed to dispatch notification [${event.type}] for user ${event.userId}`,
        err,
      );
    }
  }
}
