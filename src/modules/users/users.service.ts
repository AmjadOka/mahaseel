import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { UploadService } from '../upload/upload.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { PromotionStatus } from 'src/common/enums/promotionStatus';
import { NotificationsService } from '../notifications/services/notifications.service';
import { NotificationType } from 'src/common/enums/notification.enum';
import { Order } from '../orders/entities/order.entity';
// import { StorageService } from '../../shared/storage/storage.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateProfileDto {
  fullName?: string;
  bio?: string;
}

export interface PublicProfile {
  id: string;
  fullName: string | null;
  profileImage: string | null;
  ratingAvg: number;
  ratingCount: number;
  role: Role;
  createdAt: Date;
}

export interface UserStats {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  ratingAvg: number;
  ratingCount: number;
}

// ── Cache constants ────────────────────────────────────────────────────────────

const TTL = {
  user: 60 * 15, // 15 min — full user row (internal + self-access)
  public: 60 * 15, // 15 min — public profile (read-heavy, rarely changes)
  stats: 60 * 5, // 5 min  — order stats mutated by Orders service; short TTL only
} as const;

const CK = {
  user: (id: string) => `users:id:${id}`,
  public: (id: string) => `users:public:${id}`,
  stats: (id: string) => `users:stats:${id}`,
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly uploadService: UploadService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Full user row — for authenticated self-access and internal service use.
   * Never return this to unauthenticated callers.
   */
  async findById(id: string): Promise<User> {
    const cached = await this.redis.get(CK.user(id));
    if (cached) return JSON.parse(cached) as User;

    const user = await this.repo.findOne({ where: { id, isDeleted: false } });
    if (!user) throw new NotFoundException('User not found');

    await this.redis.set(CK.user(id), JSON.stringify(user), TTL.user);
    return user;
  }

  /**
   * Public-facing profile — only exposes safe fields, only for active users.
   */
  async getPublicProfile(id: string): Promise<PublicProfile> {
    const cached = await this.redis.get(CK.public(id));
    if (cached) return JSON.parse(cached) as PublicProfile;

    const user = await this.repo.findOne({
      where: { id, isActive: true, isDeleted: false },
      select: [
        'id',
        'fullName',
        'profileImage',
        'ratingAvg',
        'ratingCount',
        'role',
        'createdAt',
      ],
    });
    if (!user) throw new NotFoundException('User not found');
    await this.redis.set(CK.public(id), JSON.stringify(user), TTL.public);

    return user;
  }

  /**
   * Order and rating stats for a user's profile page.
   * Uses a raw query to avoid loading all order rows into memory.
   */
  async getStats(userId: string): Promise<UserStats> {
    const cached = await this.redis.get(CK.stats(userId));
    if (cached) return JSON.parse(cached) as UserStats;

    const user = await this.findById(userId);

    const row = await this.repo
      .createQueryBuilder('u')
      .select('COUNT(o.id)', 'totalOrders')
      .addSelect(
        `COUNT(CASE WHEN o.status = 'completed' THEN 1 END)`,
        'completedOrders',
      )
      .addSelect(
        `COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)`,
        'cancelledOrders',
      )
      .leftJoin(Order, 'o', 'o.buyer_id = u.id OR o.merchant_id = u.id')
      .where('u.id = :userId', { userId })
      .getRawOne<{
        totalOrders: string;
        completedOrders: string;
        cancelledOrders: string;
      }>();

    const stats: UserStats = {
      totalOrders: parseInt(row?.totalOrders ?? '0', 10),
      completedOrders: parseInt(row?.completedOrders ?? '0', 10),
      cancelledOrders: parseInt(row?.cancelledOrders ?? '0', 10),
      ratingAvg: Number(user.ratingAvg ?? 0),
      ratingCount: user.ratingCount ?? 0,
    };

    await this.redis.set(CK.stats(userId), JSON.stringify(stats), TTL.stats);
    return stats;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Updates mutable profile fields.
   * Trims fullName to prevent whitespace-only values.
   */
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.findById(id);

    const sanitized: UpdateProfileDto = {};

    if (dto.fullName !== undefined) {
      const trimmed = dto.fullName.trim();
      if (!trimmed) throw new BadRequestException('Full name cannot be empty');
      sanitized.fullName = trimmed;
    }

    if (dto.bio !== undefined) {
      sanitized.bio = dto.bio.trim();
    }

    await this.repo.update(id, sanitized);
    await this.bustUser(id);

    return this.findById(id);
  }

  async uploadAvatar(id: string, file: Express.Multer.File): Promise<User> {
    const user = await this.findById(id);

    const uploaded = user.avatarPublicId
      ? await this.uploadService.replace(file, 'users', user.avatarPublicId)
      : await this.uploadService.upload(file, 'users');

    await this.repo.update(id, {
      profileImage: uploaded.url,
      avatarPublicId: uploaded.publicId,
    });

    await this.bustUser(id);

    return this.findById(id);
  }

  /**
   * Deletes the avatar from Cloudinary and resets profileImage to null.
   */
  async removeAvatar(id: string): Promise<User> {
    const user = await this.findById(id);

    if (!user.profileImage) {
      throw new BadRequestException('No avatar to remove');
    }

    if (user.avatarPublicId) {
      await this.uploadService.delete(user.avatarPublicId);
    }

    // QueryBuilder guarantees nulls are written — repo.update() can skip them
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ profileImage: null, avatarPublicId: null })
      .where('id = :id', { id })
      .execute();

    await this.bustUser(id);

    return this.findById(id);
  }

  // ─── Request Promote to Merchant ────────────────────────────────────────────

  /**
   * Allows a BUYER to request promotion to MERCHANT.
   * Sets promotionStatus = PENDING so an admin can approve/reject later.
   *
   * Guards:
   *  - User must exist and be active
   *  - User must currently be a BUYER (not already a MERCHANT / ADMIN)
   *  - No duplicate pending request
   */

  async requestPromoteToMerchant(userId: string): Promise<{ message: string }> {
    const user = await this.repo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.isActive) {
      throw new BadRequestException(
        'Your account must be active before requesting promotion.',
      );
    }

    if (user.role !== Role.BUYER) {
      throw new BadRequestException(
        'Only buyers can request promotion to merchant.',
      );
    }

    if (user.promotionStatus === PromotionStatus.PENDING) {
      throw new ConflictException(
        'You already have a pending promotion request.',
      );
    }

    if (user.promotionStatus === PromotionStatus.APPROVED) {
      throw new ConflictException('Your promotion has already been approved.');
    }

    await this.repo.update(userId, {
      promotionStatus: PromotionStatus.PENDING,
    });

    await this.notificationService.notify(userId, {
      type: NotificationType.ACCOUNT_PROMOTING_PENDING,
      title: 'PROMOTING REQUEST UNDER REVIEW',
      body: `WE RECEIVED YOUR REQUEST FOR MERCHANT UPGRADE WE WILL TOUCH YOU SOON`,
      titleAr: 'طلبك قيد المراجعة',
      bodyAr: 'طلبك قيد المراجعة سوف نقوم بالرد عليك قريبا',
      referenceType: 'farm',
      referenceId: user.id,
    });
    return { message: 'Promotion request submitted. Pending admin approval.' };
  }

  /**
   * Busts both the internal user row and the public profile in one shot.
   * Call after any mutation that changes fields visible in either response.
   */
  private async bustUser(id: string): Promise<void> {
    await Promise.all([
      this.redis.del(CK.user(id)),
      this.redis.del(CK.public(id)),
      this.redis.del(CK.stats(id)),
    ]);
  }
}
