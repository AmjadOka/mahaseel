import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThan, Repository } from 'typeorm';

import { Notification } from '../entities/notification.entity';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from 'src/common/enums/notification.enum';
import { NotificationCreatedEvent } from '../events/notification-created.event';
import { RedisService } from 'src/shared/redis/redis.service';
import { NOTIFICATIONS_CK, NOTIFICATIONS_TTL } from '../notifications.cache';
import { NOTIFICATION_CREATED } from '../listeners/notifications.listener';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly emitter: EventEmitter2,
    private readonly redis: RedisService,
  ) {}

  // ─── Core notify ──────────────────────────────────────────────────────────

  async notify(
    userId: string,
    payload: {
      type: NotificationType;
      title: string;
      body: string;
      titleAr?: string;
      bodyAr?: string;
      priority?: NotificationPriority;
      channels?: NotificationChannel[];
      referenceType?: string;
      referenceId?: string;
      data?: Record<string, any>;
    },
  ): Promise<void> {
    const event = new NotificationCreatedEvent({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      titleAr: payload.titleAr,
      bodyAr: payload.bodyAr,
      priority: payload.priority ?? NotificationPriority.NORMAL,
      channels: payload.channels ?? [NotificationChannel.IN_APP],
      data: {
        ...(payload.data ?? {}),
        ...(payload.referenceType
          ? { referenceType: payload.referenceType }
          : {}),
        ...(payload.referenceId ? { referenceId: payload.referenceId } : {}),
      },
    });

    await this.emitter.emitAsync(NOTIFICATION_CREATED, event);

    this.logger.debug(
      `Notification emitted [${payload.type}] to user ${userId}`,
    );
  }

  // ─── Typed convenience wrappers ───────────────────────────────────────────

  async notifyWithdrawalCompleted(params: {
    userId: string;
    amount: number;
    withdrawalId: string;
    userEmail?: string;
  }): Promise<void> {
    await this.notify(params.userId, {
      type: NotificationType.WITHDRAWAL_COMPLETED,
      title: 'Withdrawal completed',
      body: `${params.amount} transferred successfully`,
      titleAr: 'تم التحويل',
      bodyAr: `تم تحويل ${params.amount} بنجاح`,
      referenceType: 'withdrawal',
      referenceId: params.withdrawalId,
      channels: params.userEmail
        ? [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
        : [NotificationChannel.IN_APP],
      data: {
        amount: params.amount,
        ...(params.userEmail ? { userEmail: params.userEmail } : {}),
      },
    });
  }

  async notifyWithdrawalRequested(params: {
    userId: string;
    amount: number;
    withdrawalId: string;
  }): Promise<void> {
    await this.notify(params.userId, {
      type: NotificationType.WITHDRAWAL_REQUESTED,
      title: 'Withdrawal request submitted',
      body: `Your withdrawal request of ${params.amount} SAR is under review`,
      titleAr: 'تم تقديم طلب السحب',
      bodyAr: `تم استلام طلب سحب بقيمة ${params.amount} وهو قيد المراجعة`,
      referenceType: 'withdrawal',
      referenceId: params.withdrawalId,
      data: { amount: params.amount },
    });
  }

  async notifyWithdrawalRejected(params: {
    userId: string;
    amount: number;
    withdrawalId: string;
    reason?: string;
    userEmail?: string;
  }): Promise<void> {
    await this.notify(params.userId, {
      type: NotificationType.WITHDRAWAL_REJECTED,
      title: 'Withdrawal rejected',
      body: `Your withdrawal of ${params.amount} SAR was rejected`,
      titleAr: 'تم رفض طلب السحب',
      bodyAr: `تم رفض طلب السحب بقيمة ${params.amount}`,
      referenceType: 'withdrawal',
      referenceId: params.withdrawalId,
      channels: params.userEmail
        ? [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
        : [NotificationChannel.IN_APP],
      data: {
        amount: params.amount,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    });
  }

  // ─── Read / CRUD ──────────────────────────────────────────────────────────

  async getAll(userId: string, page = 1, limit = 20) {
    const version = await this.getVersion(NOTIFICATIONS_CK.allVersion(userId));
    const cacheKey = NOTIFICATIONS_CK.all(userId, version, page, limit);

    const cached = await this.redis.get(cacheKey);
    if (cached)
      return JSON.parse(cached) as { data: Notification[]; total: number };

    const [data, total] = await this.notificationRepo.findAndCount({
      where: { userId } as FindOptionsWhere<Notification>,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const result = { data, total };
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      NOTIFICATIONS_TTL.all,
    );
    return result;
  }

  async getUnread(userId: string, limit = 50): Promise<Notification[]> {
    const cached = await this.redis.get(NOTIFICATIONS_CK.unread(userId));
    if (cached) return JSON.parse(cached) as Notification[];

    const notifications = await this.notificationRepo.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    await this.redis.set(
      NOTIFICATIONS_CK.unread(userId),
      JSON.stringify(notifications),
      NOTIFICATIONS_TTL.unread,
    );
    return notifications;
  }

  async countUnread(userId: string): Promise<number> {
    const cached = await this.redis.get(NOTIFICATIONS_CK.count(userId));
    if (cached) return parseInt(cached, 10);

    const count = await this.notificationRepo.count({
      where: { userId, isRead: false },
    });

    await this.redis.set(
      NOTIFICATIONS_CK.count(userId),
      String(count),
      NOTIFICATIONS_TTL.unread,
    );
    return count;
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });
    if (!notification)
      throw new NotFoundException(`Notification ${id} not found`);

    notification.isRead = true;
    notification.readAt = new Date();
    const saved = await this.notificationRepo.save(notification);

    await this.bustUnreadForUser(userId); // ← replaces old bustUnread()
    return saved;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    await this.bustUnreadForUser(userId); // ← replaces old bustUnread()
  }

  async cleanupOldNotifications(daysToKeep = 30): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await this.notificationRepo.delete({
      createdAt: LessThan(cutoff),
      isRead: true,
    });

    this.logger.log(
      `Cleaned up ${result.affected ?? 0} read notifications older than ${daysToKeep} days`,
    );
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  /**
   * Busts all user-scoped notification caches in one shot:
   * - unread list
   * - unread count
   * - all paginated pages (via version bump — orphaned keys expire naturally)
   *
   * Called by:
   *  - markAsRead / markAllAsRead (read state changed)
   *  - NotificationCreatedListener (new notification added)
   */
  async bustUnreadForUser(userId: string): Promise<void> {
    const currentVersion = await this.getVersion(
      NOTIFICATIONS_CK.allVersion(userId),
    );

    await Promise.all([
      this.redis.del(NOTIFICATIONS_CK.unread(userId)),
      this.redis.del(NOTIFICATIONS_CK.count(userId)),
      this.redis.set(
        NOTIFICATIONS_CK.allVersion(userId),
        String(currentVersion + 1),
        NOTIFICATIONS_TTL.version,
      ),
    ]);
  }

  private async getVersion(key: string): Promise<number> {
    const v = await this.redis.get(key);
    return v ? parseInt(v, 10) : 0;
  }
}
