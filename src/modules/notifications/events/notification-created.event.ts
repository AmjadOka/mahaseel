import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '../../../common/enums/notification.enum';

export class NotificationCreatedEvent {
  userId: string;
  type: NotificationType;

  /** English content — required, used as fallback when no Arabic is set */
  title: string;
  body: string;

  /** Arabic content — optional, stored and displayed for AR-locale users */
  titleAr?: string;
  bodyAr?: string;

  /**
   * Which channels to activate for this notification.
   * Defaults to [IN_APP] in NotificationsService.notify() when not specified.
   */
  channels: NotificationChannel[];
  priority: NotificationPriority;

  data?: Record<string, any>;

  constructor(partial: Partial<NotificationCreatedEvent>) {
    Object.assign(this, partial);
  }
}
