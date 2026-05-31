import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AdminAuditService } from './admin-audit.service';
import { BroadcastNotificationDto } from '../dto/index';
import { Role } from 'src/common/enums/role.enum';

export interface BroadcastResult {
  sent: number;
  failed: number;
  targetedRole?: Role;
  targetedUserIds?: string[];
}

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AdminAuditService,
  ) {}

  /**
   * Broadcast a notification to:
   *   1. Specific user IDs  (dto.userIds is set)
   *   2. All users of a role (dto.role is set, dto.userIds is not)
   *   3. Every active user   (neither is set)
   *
   */
  async broadcast(
    dto: BroadcastNotificationDto,
    adminId: string,
    adminPhone?: string,
  ): Promise<BroadcastResult> {
    const userIds = await this.resolveTargetUserIds(dto);

    if (userIds.length === 0) {
      this.logger.warn('Broadcast called but resolved to 0 target users');
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      userIds.map((uid) =>
        this.notificationsService.notify(uid, {
          type: dto.type,
          title: dto.title,
          body: dto.body,
          titleAr: dto.titleAr,
          bodyAr: dto.bodyAr,
        }),
      ),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      this.logger.warn(
        `Broadcast [type=${dto.type}]: ${sent} sent, ${failed} failed`,
      );
    } else {
      this.logger.log(
        `Broadcast [type=${dto.type}]: ${sent} notifications sent`,
      );
    }

    // Audit — record the broadcast for traceability
    await this.auditService.log({
      adminId,
      adminPhone,
      action: 'BROADCAST_NOTIFICATION',
      resourceType: 'notification',
      reason: dto.title,
      meta: {
        type: dto.type,
        targetedRole: dto.role ?? null,
        targetedUserIds: dto.userIds ?? null,
        totalTargets: userIds.length,
        sent,
        failed,
      },
    });

    return {
      sent,
      failed,
      targetedRole: dto.role,
      targetedUserIds: dto.userIds,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves the final list of user IDs to notify.
   * Priority: explicit userIds > role filter > everyone.
   */
  private async resolveTargetUserIds(
    dto: BroadcastNotificationDto,
  ): Promise<string[]> {
    // 1. Explicit list — use as-is
    if (dto.userIds && dto.userIds.length > 0) {
      return dto.userIds;
    }

    // 2. Role filter — fetch only active users of that role
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.isDeleted = false')
      .andWhere('u.isActive = true');

    if (dto.role) {
      qb.andWhere('u.role = :role', { role: dto.role });
    }

    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }
}
