import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotificationChannel } from 'src/common/enums/notification.enum';
import { EmailTemplate } from 'src/common/enums/email.enum';

import { NotificationCreatedEvent } from '../events/notification-created.event';
import { Notification } from '../entities/notification.entity';
import { FcmToken } from '../entities/fcm-token.entity';

import { FcmProvider } from '../providers/fcm.provider';
import { MailProvider } from '../providers/mail.provider';
import { NotificationsGateway } from '../gateways/notifications.gateway';

@Injectable()
export class NotificationsDispatcher {
  private readonly logger = new Logger(NotificationsDispatcher.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    @InjectRepository(FcmToken)
    private readonly fcmTokenRepo: Repository<FcmToken>,

    private readonly fcmProvider: FcmProvider,
    private readonly mailProvider: MailProvider,
    private readonly gateway: NotificationsGateway,
  ) {}

  async dispatch(event: NotificationCreatedEvent): Promise<void> {
    // Always persist to DB for notification history and unread count.
    // Arabic fields are stored here so the frontend can render the correct locale.
    const notification = await this.persistNotification(event);

    // Dispatch to each requested channel in parallel; one failing doesn't block others.
    await Promise.allSettled(
      event.channels.map((channel) =>
        this.dispatchToChannel(channel, event, notification),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persist
  // ─────────────────────────────────────────────────────────────────────────

  private async persistNotification(
    event: NotificationCreatedEvent,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: event.userId,
      type: event.type,
      priority: event.priority,

      // English
      title: event.title,
      body: event.body,

      // Arabic — now actually stored
      titleAr: event.titleAr,
      bodyAr: event.bodyAr,

      // Reference info stored directly on the row (not buried in data JSON)
      referenceType: event.data?.['referenceType'],
      referenceId: event.data?.['referenceId'],

      // Extra payload (strip out referenceType/Id since they're on the row)
      data: event.data
        ? Object.fromEntries(
            Object.entries(event.data).filter(
              ([k]) => k !== 'referenceType' && k !== 'referenceId',
            ),
          )
        : undefined,
    });

    const saved = await this.notificationRepo.save(notification);
    this.logger.debug(
      `Notification persisted [${event.type}] for user ${event.userId}`,
    );
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Channel dispatcher
  // ─────────────────────────────────────────────────────────────────────────

  private async dispatchToChannel(
    channel: NotificationChannel,
    event: NotificationCreatedEvent,
    notification: Notification,
  ): Promise<void> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        await this.emitInApp(notification);
        return;

      case NotificationChannel.PUSH:
        await this.handlePush(event, notification.id);
        return;

      case NotificationChannel.EMAIL:
        await this.handleEmail(event, notification.id);
        return;

      case NotificationChannel.SMS:
        this.logger.warn(
          `SMS not implemented yet [${event.type}] for user ${event.userId}`,
        );
        return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // In-App (WebSocket)
  // ─────────────────────────────────────────────────────────────────────────

  private async emitInApp(notification: Notification): Promise<void> {
    this.gateway.sendNotificationToUser(notification.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      titleAr: notification.titleAr,
      bodyAr: notification.bodyAr,
      referenceType: notification.referenceType,
      referenceId: notification.referenceId,
      data: notification.data,
      createdAt: notification.createdAt,
    });

    this.logger.debug(
      `Realtime notification emitted to user ${notification.userId}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Push (FCM)
  // ─────────────────────────────────────────────────────────────────────────

  private async handlePush(
    event: NotificationCreatedEvent,
    notificationId: string,
  ): Promise<void> {
    const tokens = await this.fcmTokenRepo.find({
      where: { userId: event.userId, isActive: true },
    });

    if (!tokens.length) {
      this.logger.debug(`No active FCM tokens for user ${event.userId}`);
      return;
    }

    // FCM data payload must be Record<string, string>
    const stringData: Record<string, string> = {};
    if (event.data) {
      for (const [key, value] of Object.entries(event.data)) {
        if (value !== undefined && value !== null) {
          stringData[key] = String(value);
        }
      }
    }
    // Pass Arabic fields in the FCM data payload so the mobile app can
    // pick the correct locale for the notification tray text.
    if (event.titleAr) stringData['titleAr'] = event.titleAr;
    if (event.bodyAr) stringData['bodyAr'] = event.bodyAr;

    await this.fcmProvider.sendMulticast(
      tokens.map((t) => t.token),
      event.title,
      event.body,
      stringData,
    );

    await this.notificationRepo.update(
      { id: notificationId },
      { pushEnabled: true },
    );

    this.logger.debug(`Push notification delivered to user ${event.userId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Email
  // ─────────────────────────────────────────────────────────────────────────

  private async handleEmail(
    event: NotificationCreatedEvent,
    notificationId: string,
  ): Promise<void> {
    const userEmail = event.data?.['userEmail'];

    if (!userEmail || typeof userEmail !== 'string') {
      this.logger.warn(
        `No userEmail in data for email notification [${event.type}] — skipping`,
      );
      return;
    }

    const templateMap: Partial<Record<string, EmailTemplate>> = {
      order_placed: EmailTemplate.ORDER_CONFIRMATION,
      order_accepted: EmailTemplate.ORDER_CONFIRMATION,
      payment_received: EmailTemplate.PAYMENT_RECEIPT,
      withdrawal_completed: EmailTemplate.WITHDRAWAL_APPROVED,
    };

    const template = templateMap[event.type];
    if (!template) {
      this.logger.debug(
        `No email template for notification type [${event.type}] — skipping`,
      );
      return;
    }

    await this.mailProvider.send({
      to: userEmail,
      template,
      subject: event.title,
      context: event.data ?? {},
    });

    await this.notificationRepo.update(
      { id: notificationId },
      { emailed: true },
    );

    this.logger.debug(`Email notification sent to ${userEmail}`);
  }
}
