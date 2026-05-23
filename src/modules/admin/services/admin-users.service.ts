import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';

import { Role } from 'src/common/enums/role.enum';
import { NotificationType } from 'src/common/enums/notification.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserFilters {
  role?: Role;
  isActive?: boolean;
  search?: string; // ILIKE on phone / email
}

export interface UserStats {
  total: number;
  buyers: number;
  merchants: number;
  admins: number;
  active: number;
  suspended: number;
}

export interface SuspendPayload {
  adminId: string;
  reason?: string;
}

export interface ReinstatePayload {
  adminId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getUsers(pagination: PaginationDto, filters: UserFilters = {}) {
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .where('u.isDeleted = false')
      .orderBy('u.createdAt', 'DESC');

    if (filters.role !== undefined)
      qb.andWhere('u.role = :role', { role: filters.role });

    if (filters.isActive !== undefined)
      qb.andWhere('u.isActive = :isActive', { isActive: filters.isActive });

    if (filters.search)
      qb.andWhere('(u.phone ILIKE :q OR u.email ILIKE :q)', {
        q: `%${filters.search}%`,
      });

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getUser(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id, isDeleted: false },
      relations: ['farms', 'buyerOrders', 'merchantOrders', 'fcmTokens'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getStats(): Promise<UserStats> {
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('u.isActive', 'isActive')
      .addSelect('COUNT(*)', 'count')
      .where('u.isDeleted = false')
      .groupBy('u.role')
      .addGroupBy('u.isActive')
      .getRawMany<{ role: Role; isActive: boolean; count: string }>();

    const base: UserStats = {
      total: 0,
      buyers: 0,
      merchants: 0,
      admins: 0,
      active: 0,
      suspended: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      base.total += count;

      if (row.isActive) base.active += count;
      else base.suspended += count;

      switch (row.role) {
        case Role.BUYER:
          base.buyers += count;
          break;
        case Role.MERCHANT:
          base.merchants += count;
          break;
        case Role.ADMIN:
          base.admins += count;
          break;
      }
    }

    return base;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Suspends an active user account.
   * Guards against suspending an already-suspended or admin account.
   * Notifies the user with the reason.
   */
  async suspendUser(id: string, payload: SuspendPayload) {
    const user = await this.findOrFail(id);

    if (!user.isActive)
      throw new ConflictException('User is already suspended.');
    if (user.role === Role.ADMIN)
      throw new ConflictException('Admin accounts cannot be suspended.');

    await this.usersRepo.update(id, { isActive: false });

    this.logger.warn(`User suspended [id=${id}] by admin [${payload.adminId}]`);

    await this.notificationsService.notify(id, {
      type: NotificationType.ACCOUNT_SUSPENDED,
      title: 'Account suspended',
      body:
        payload.reason ??
        'Your account has been suspended. Please contact support.',
      titleAr: 'تم تعليق الحساب',
      bodyAr: payload.reason
        ? `سبب التعليق: ${payload.reason}`
        : 'تم تعليق حسابك. تواصل مع الدعم.',
    });

    return { message: `User ${user.phone} suspended`, userId: id };
  }

  /**
   * Reinstates a suspended user.
   * Notifies the user so they know they can log in again.
   */
  async reinstateUser(id: string, payload: ReinstatePayload) {
    const user = await this.findOrFail(id);

    if (user.isActive) throw new ConflictException('User is already active.');

    await this.usersRepo.update(id, { isActive: true });

    this.logger.log(`User reinstated [id=${id}] by admin [${payload.adminId}]`);

    await this.notificationsService.notify(id, {
      type: NotificationType.ACCOUNT_REINSTATED,
      title: 'Account reinstated ✅',
      body: 'Your account has been reinstated. Welcome back!',
      titleAr: 'تمت استعادة الحساب ✅',
      bodyAr: 'تمت استعادة حسابك. مرحباً بعودتك!',
    });

    return { message: `User ${user.phone} reinstated`, userId: id };
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private async findOrFail(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
