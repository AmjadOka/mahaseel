import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
// import { StorageService } from '../../shared/storage/storage.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateProfileDto {
  fullName?: string;
  bio?: string;
}

export interface PublicProfile {
  id: string;
  fullName: string;
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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    // private readonly storage: StorageService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Full user row — for authenticated self-access and internal service use.
   * Never return this to unauthenticated callers.
   */
  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id, isDeleted: false } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Public-facing profile — only exposes safe fields, only for active users.
   */
  async getPublicProfile(id: string): Promise<PublicProfile> {
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
    return user;
  }

  /**
   * Order and rating stats for a user's profile page.
   * Uses a raw query to avoid loading all order rows into memory.
   */
  async getStats(userId: string): Promise<UserStats> {
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
      .leftJoin('orders', 'o', 'o.buyer_id = u.id OR o.merchant_id = u.id')
      .where('u.id = :userId', { userId })
      .getRawOne<{
        totalOrders: string;
        completedOrders: string;
        cancelledOrders: string;
      }>();

    return {
      totalOrders: parseInt(row?.totalOrders ?? '0', 10),
      completedOrders: parseInt(row?.completedOrders ?? '0', 10),
      cancelledOrders: parseInt(row?.cancelledOrders ?? '0', 10),
      ratingAvg: Number(user.ratingAvg ?? 0),
      ratingCount: user.ratingCount ?? 0,
    };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Updates mutable profile fields.
   * Trims fullName to prevent whitespace-only values.
   */
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.findById(id); // ensure user exists before updating

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
    return this.findById(id);
  }

  /**
   * Uploads a new avatar, stores it via StorageService, and updates the DB.
   * Old avatar URL is replaced — storage cleanup can be added here when
   * StorageService.delete() is available.
   */
  async uploadAvatar(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<User> {
    if (!mimetype.startsWith('image/')) {
      throw new BadRequestException(
        'Only image files are accepted for avatars',
      );
    }

    await this.findById(id); // ensure user exists before uploading

    /* const url = await this.storage.upload(
      buffer,
      originalName,
      'avatars',
      mimetype,
    );
    await this.repo.update(id, { profileImage: url }); */

    // TODO: uncomment above when StorageService is injected
    this.logger.warn(
      `uploadAvatar called for user [${id}] — storage not wired yet`,
    );

    return this.findById(id);
  }

  /**
   * Removes avatar and resets profileImage to null.
   */
  async removeAvatar(id: string): Promise<User> {
    const user = await this.findById(id);

    if (!user.profileImage) {
      throw new BadRequestException('No avatar to remove');
    }

    // TODO: await this.storage.delete(user.profileImage);
    await this.repo.update(id, { profileImage: null });

    return this.findById(id);
  }

  /**
   * Soft-deletes a user.
   * Marks deleted, inactive, and stamps deletedAt.
   * Hard deletes are intentionally not exposed — use DB-level admin tools.
  async softDelete(id: string): Promise<void> {
    await this.findById(id);

    await this.repo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
    });

    this.logger.log(`User soft-deleted [id=${id}]`);
  }
       */
}
