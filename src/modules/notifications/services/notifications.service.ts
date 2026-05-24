import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThan, Repository } from 'typeorm';

import { FcmToken } from '../entities/fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from 'src/common/enums/notification.enum';
import { NotificationCreatedEvent } from '../events/notification-created.event';
import { Platform } from 'src/common/enums/platform.enum';
import { RedisService } from 'src/shared/redis/redis.service';

// ── Cache constants ────────────────────────────────────────────────────────────

const TTL = {
  unread: 60 * 2, // 2 min — unread list and count; busted on every new notification
  all: 60 * 1, // 1 min — paginated full list; short TTL only (can't bust all page variants)
} as const;

const CK = {
  count: (userId: string) => `notifications:count:${userId}`,
  unread: (userId: string) => `notifications:unread:${userId}`,
  all: (userId: string, page: number, limit: number) =>
    `notifications:all:${userId}:${page}:${limit}`,
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepo: Repository<FcmToken>,
    private readonly emitter: EventEmitter2,
    // private readonly redis = this.notificationRepo.manager.connection.redis;
    private readonly redis: RedisService,
  ) {}

  // ─── Core notify ─────────────────────────────────────────────────────────────

  /**
   * The single entry point for all notifications across the app.
   *
   * - Always defaults to [IN_APP, PUSH] channels unless overridden.
   * - Uses emitAsync so the listener awaits dispatch before the caller continues.
   */
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
      channels: payload.channels ?? [
        NotificationChannel.IN_APP,
        NotificationChannel.PUSH,
      ],

      data: {
        ...(payload.data ?? {}),
        // Reference fields passed in data so dispatcher can pick them up
        ...(payload.referenceType
          ? { referenceType: payload.referenceType }
          : {}),
        ...(payload.referenceId ? { referenceId: payload.referenceId } : {}),
      },
    });

    await this.emitter.emitAsync('notification.created', event);
    await this.bustUnread(userId);

    this.logger.debug(
      `Notification dispatched [${payload.type}] to user ${userId}`,
    );
  }

  // ─── Typed convenience wrappers ───────────────────────────────────────────────
  //
  // These keep call sites clean without sprinkling raw type/title/body strings
  // everywhere in other services. Add new ones here as the domain grows.

  async notifyWithdrawalCompleted(params: {
    userId: string;
    amount: number;
    withdrawalId: string;
  }): Promise<void> {
    await this.notify(params.userId, {
      type: NotificationType.WITHDRAWAL_COMPLETED,
      title: 'Withdrawal completed',
      body: `${params.amount} SAR transferred successfully`,
      titleAr: 'تم التحويل',
      bodyAr: `تم تحويل ${params.amount} ريال بنجاح`,
      referenceType: 'withdrawal',
      referenceId: params.withdrawalId,
      data: { amount: params.amount },
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
      bodyAr: `تم استلام طلب سحب بقيمة ${params.amount} ريال وهو قيد المراجعة`,
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
  }): Promise<void> {
    await this.notify(params.userId, {
      type: NotificationType.WITHDRAWAL_REJECTED,
      title: 'Withdrawal rejected',
      body: `Your withdrawal of ${params.amount} SAR was rejected`,
      titleAr: 'تم رفض طلب السحب',
      bodyAr: `تم رفض طلب السحب بقيمة ${params.amount} ريال`,
      referenceType: 'withdrawal',
      referenceId: params.withdrawalId,
      data: {
        amount: params.amount,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    });
  }

  // ─── Read / CRUD ──────────────────────────────────────────────────────────────

  async getAll(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number }> {
    const cacheKey = CK.all(userId, page, limit);

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
    await this.redis.set(cacheKey, JSON.stringify(result), TTL.all);
    return result;
  }

  async getUnread(userId: string): Promise<Notification[]> {
    const cached = await this.redis.get(CK.unread(userId));
    if (cached) return JSON.parse(cached) as Notification[];

    const notifications = await this.notificationRepo.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
    });

    await this.redis.set(
      CK.unread(userId),
      JSON.stringify(notifications),
      TTL.unread,
    );
    return notifications;
  }

  async countUnread(userId: string): Promise<number> {
    const cached = await this.redis.get(CK.count(userId));
    if (cached) return parseInt(cached, 10);

    const count = await this.notificationRepo.count({
      where: { userId, isRead: false },
    });

    await this.redis.set(CK.count(userId), String(count), TTL.unread);
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
    await this.bustUnread(userId);

    return saved;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    await this.bustUnread(userId);
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

  // ─── FCM Token Management ─────────────────────────────────────────────────────

  async registerFcmToken(
    userId: string,
    token: string,
    platform: Platform,
  ): Promise<FcmToken> {
    const existing = await this.fcmTokenRepo.findOne({
      where: { userId, token },
    });

    if (existing) {
      existing.isActive = true;
      existing.platform = platform;
      return this.fcmTokenRepo.save(existing);
    }

    return this.fcmTokenRepo.save(
      this.fcmTokenRepo.create({ userId, token, platform }),
    );
  }

  async removeFcmToken(userId: string, token: string): Promise<void> {
    await this.fcmTokenRepo.update({ userId, token }, { isActive: false });
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────────

  /**
   * Busts the unread list and unread count together.
   * Called after: notify(), markAsRead(), markAllAsRead().
   */
  private async bustUnread(userId: string): Promise<void> {
    await Promise.all([
      this.redis.del(CK.unread(userId)),
      this.redis.del(CK.count(userId)),
    ]);
  }
}
