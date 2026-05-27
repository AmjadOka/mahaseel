import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  NotificationChannel,
  NotificationType,
} from 'src/common/enums/notification.enum';
import { EmailTemplate } from 'src/common/enums/email.enum';

import { NotificationCreatedEvent } from '../events/notification-created.event';
import { Notification } from '../entities/notification.entity';

import { MailProvider } from 'src/shared/mail/mail.provider';
import { NotificationsGateway } from '../gateways/notifications.gateway';

const EMAIL_TEMPLATE_MAP: Partial<Record<NotificationType, EmailTemplate>> = {
  [NotificationType.ORDER_PLACED]: EmailTemplate.ORDER_CONFIRMATION,
  [NotificationType.ORDER_ACCEPTED]: EmailTemplate.ORDER_CONFIRMATION,
  [NotificationType.PAYMENT_RECEIVED]: EmailTemplate.PAYMENT_RECEIPT,
  [NotificationType.WITHDRAWAL_COMPLETED]: EmailTemplate.WITHDRAWAL_APPROVED,
};

@Injectable()
export class NotificationsDispatcher {
  private readonly logger = new Logger(NotificationsDispatcher.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    private readonly mailProvider: MailProvider,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Main entry point called by the listener.
   *
   * Flow:
   *  1. Persist exactly once.
   *  2. Dispatch to each requested channel in parallel — one failure
   *     does not block the others (Promise.allSettled).
   */
  async dispatch(event: NotificationCreatedEvent): Promise<Notification> {
    const notification = await this.persistNotification(event);

    await Promise.allSettled(
      event.channels.map((channel) =>
        this.dispatchToChannel(channel, event, notification),
      ),
    );

    return notification;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persist (called exactly once per event)
  // ─────────────────────────────────────────────────────────────────────────

  private async persistNotification(
    event: NotificationCreatedEvent,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: event.userId,
      type: event.type,
      priority: event.priority,

      title: event.title,
      body: event.body,
      titleAr: event.titleAr,
      bodyAr: event.bodyAr,

      referenceType: event.data?.['referenceType'],
      referenceId: event.data?.['referenceId'],

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
      `Notification persisted [${event.type}] for user ${event.userId} id=${saved.id}`,
    );
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Channel router
  // ─────────────────────────────────────────────────────────────────────────

  private async dispatchToChannel(
    channel: NotificationChannel,
    event: NotificationCreatedEvent,
    notification: Notification,
  ): Promise<void> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        this.emitInApp(notification);
        return;

      case NotificationChannel.EMAIL:
        await this.handleEmail(event, notification.id);
        return;

      case NotificationChannel.SMS:
        this.logger.warn(
          `SMS channel not implemented yet [${event.type}] user=${event.userId}`,
        );
        return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // In-App (WebSocket)
  // ─────────────────────────────────────────────────────────────────────────

  private emitInApp(notification: Notification): void {
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

    this.logger.debug(`WS notification emitted to user ${notification.userId}`);
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
        `No userEmail in event.data for [${event.type}] — skipping email`,
      );
      return;
    }

    const template = EMAIL_TEMPLATE_MAP[event.type];
    if (!template) {
      this.logger.debug(
        `No email template mapped for [${event.type}] — skipping email`,
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

    this.logger.debug(`Email sent to ${userEmail} [${event.type}]`);
  }
}
