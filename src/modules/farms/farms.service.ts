import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { Farm, FarmMedia, FarmAssetKind } from './entities/farm.entity';
import { CreateFarmDto, UpdateFarmDto } from './dto/create-farm.dto';
import { FarmStatus } from 'src/common/enums/farm.enum';
import { NotificationsService } from '../notifications/services/notifications.service';
import { NotificationType } from 'src/common/enums/notification.enum';
import { UploadService } from '../upload/upload.service';
import { MediaType } from 'src/common/enums/platform.enum';
import { RedisService } from 'src/shared/redis/redis.service';
import { Product } from '../products/entities/product.entity';

// ─── DTOs / Types ────────────────────────────────────────────────────────────

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface FarmFilters {
  status?: FarmStatus;
  search?: string;
  ownerId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface FarmStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
}

export interface ApprovalPayload {
  adminId: string;
  note?: string;
}

export interface RejectionPayload extends ApprovalPayload {
  reason: string;
}

// ── Cache constants ────────────────────────────────────────────────────────────

const TTL = {
  farmDetail: 60 * 10,
  ownerList: 60 * 3,
  stats: 60 * 2,
  farmProducts: 60 * 5,
} as const;

const CK = {
  one: (id: string) => `farms:one:${id}`,
  products: (farmId: string) => `farms:products:${farmId}`,
  stats: (ownerId?: string) =>
    ownerId ? `farms:stats:${ownerId}` : 'farms:stats',
  ownerList: (
    ownerId: string,
    opts: PaginationOptions,
    filters: Pick<FarmFilters, 'status' | 'search'>,
  ) => {
    const params = { ...opts, ...filters };
    const stable = Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    return `farms:owner:${ownerId}:${JSON.stringify(stable)}`;
  },
} as const;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class FarmsService {
  private readonly logger = new Logger(FarmsService.name);

  constructor(
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmMedia)
    private readonly mediaRepo: Repository<FarmMedia>,
    private readonly notificationsService: NotificationsService,
    private readonly uploadService: UploadService,
    private readonly redis: RedisService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreateFarmDto): Promise<Farm> {
    await this.assertNoDuplicateName(ownerId, dto.name);

    const farm = this.farmRepo.create({
      ...dto,
      ownerId,
      status: FarmStatus.PENDING,
    });

    const saved = await this.farmRepo.save(farm);
    this.logger.log(`Farm created [id=${saved.id}] by owner [${ownerId}]`);

    await this.notificationsService.notify(ownerId, {
      type: NotificationType.FARM_PENDING,
      title: 'Farm submitted for review 🌾',
      body: `"${saved.name}" is under review. We'll notify you once it's approved.`,
      titleAr: 'تم إرسال المزرعة للمراجعة 🌾',
      bodyAr: `"${saved.name}" قيد المراجعة. سنُخطرك عند الموافقة.`,
      referenceType: 'farm',
      referenceId: saved.id,
    });

    await this.bustStats(ownerId);

    return saved;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async findMyFarms(
    ownerId: string,
    { page = 1, limit = 10 }: PaginationOptions = {},
    filters: Pick<FarmFilters, 'status' | 'search'> = {},
  ): Promise<PaginatedResult<Farm>> {
    const where: FindOptionsWhere<Farm> = { ownerId, isDeleted: false };
    const cacheKey = CK.ownerList(ownerId, { page, limit }, filters);

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as PaginatedResult<Farm>;

    if (filters.status) where.status = filters.status;

    const qb = this.farmRepo.createQueryBuilder('farm').where(where);

    if (filters.search) {
      qb.andWhere('(farm.name ILIKE :q OR farm.location ILIKE :q)', {
        q: `%${filters.search}%`,
      });
    }

    qb.orderBy('farm.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    const result: PaginatedResult<Farm> = {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
    await this.redis.set(cacheKey, JSON.stringify(result), TTL.ownerList);

    return result;
  }

  async findAll(
    { page = 1, limit = 20 }: PaginationOptions = {},
    filters: FarmFilters = {},
  ): Promise<PaginatedResult<Farm>> {
    const qb = this.farmRepo
      .createQueryBuilder('farm')
      .leftJoinAndSelect('farm.owner', 'owner')
      .where('farm.isDeleted = false');

    if (filters.status)
      qb.andWhere('farm.status = :status', { status: filters.status });
    if (filters.ownerId)
      qb.andWhere('farm.ownerId = :ownerId', { ownerId: filters.ownerId });
    if (filters.search) {
      qb.andWhere('(farm.name ILIKE :q OR farm.location ILIKE :q)', {
        q: `%${filters.search}%`,
      });
    }

    qb.orderBy('farm.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(
    id: string,
    ownerId?: string,
    includeDeleted = false,
  ): Promise<Farm> {
    if (!includeDeleted) {
      const cached = await this.redis.get(CK.one(id));
      if (cached) {
        const farm = JSON.parse(cached) as Farm;
        if (ownerId && farm.ownerId !== ownerId)
          throw new ForbiddenException('Access denied');
        return farm;
      }
    }
    const qb = this.farmRepo
      .createQueryBuilder('farm')
      .leftJoinAndSelect('farm.owner', 'owner')
      .leftJoinAndSelect('farm.products', 'products')
      .where('farm.id = :id', { id });

    if (!includeDeleted) qb.andWhere('farm.isDeleted = false');

    const farm = await qb.getOne();

    if (!farm) throw new NotFoundException('Farm not found');
    if (ownerId && farm.ownerId !== ownerId)
      throw new ForbiddenException('Access denied');

    if (!includeDeleted) {
      await this.redis.set(CK.one(id), JSON.stringify(farm), TTL.farmDetail);
    }
    return farm;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, ownerId: string, dto: UpdateFarmDto): Promise<Farm> {
    const farm = await this.findOne(id, ownerId);

    if (farm.status === FarmStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot edit an approved farm. Please contact support.',
      );
    }

    if (farm.status === FarmStatus.SUSPENDED) {
      throw new BadRequestException('Cannot edit a suspended farm.');
    }

    const wasRejected = farm.status === FarmStatus.REJECTED;
    Object.assign(farm, dto);
    if (wasRejected) {
      farm.status = FarmStatus.PENDING;
      farm.rejectionReason = null;
    }

    const saved = await this.farmRepo.save(farm);
    this.logger.log(`Farm updated [id=${id}] by owner [${ownerId}]`);

    if (wasRejected) {
      await this.notificationsService.notify(ownerId, {
        type: NotificationType.FARM_PENDING,
        title: 'Farm re-submitted for review 🌾',
        body: `"${saved.name}" has been re-submitted and is under review.`,
        titleAr: 'تمت إعادة تقديم المزرعة للمراجعة 🌾',
        bodyAr: `"${saved.name}" أُعيد تقديمها وهي قيد المراجعة.`,
        referenceType: 'farm',
        referenceId: saved.id,
      });
    }
    await this.redis.del(CK.one(id));

    return saved;
  }

  // ── Admin: Approve / Reject / Suspend / Unsuspend ──────────────────────────

  async approveFarm(farmId: string, payload: ApprovalPayload): Promise<Farm> {
    const farm = await this.findOne(farmId);

    if (farm.status === FarmStatus.APPROVED) {
      throw new ConflictException('Farm is already approved.');
    }
    if (farm.status === FarmStatus.SUSPENDED) {
      throw new BadRequestException('Cannot approve a suspended farm.');
    }

    await this.farmRepo.update(farmId, {
      status: FarmStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: payload.adminId,
      rejectionReason: null,
    });

    this.logger.log(
      `Farm approved [id=${farmId}] by admin [${payload.adminId}]`,
    );

    await this.notificationsService.notify(farm.ownerId, {
      type: NotificationType.FARM_APPROVED,
      title: 'Farm approved ✅',
      body: `Congratulations! "${farm.name}" has been approved. You can now add your crops.`,
      titleAr: 'تمت الموافقة على المزرعة ✅',
      bodyAr: `تهانينا! تمت الموافقة على "${farm.name}". يمكنك الآن إضافة محاصيلك.`,
      referenceType: 'farm',
      referenceId: farm.id,
    });

    await this.bustFarmAndStats(farmId, farm.ownerId);

    return this.findOne(farmId);
  }

  async rejectFarm(farmId: string, payload: RejectionPayload): Promise<Farm> {
    const farm = await this.findOne(farmId);

    if (farm.status === FarmStatus.REJECTED) {
      throw new ConflictException('Farm is already rejected.');
    }

    await this.farmRepo.update(farmId, {
      status: FarmStatus.REJECTED,
      rejectionReason: payload.reason,
      approvedBy: null,
      approvedAt: null,
    });

    this.logger.log(
      `Farm rejected [id=${farmId}] by admin [${payload.adminId}] – reason: ${payload.reason}`,
    );

    await this.notificationsService.notify(farm.ownerId, {
      type: NotificationType.FARM_REJECTED,
      title: 'Farm rejected ❌',
      body: `"${farm.name}" was not approved. Reason: ${payload.reason}. You may edit and resubmit.`,
      titleAr: 'تم رفض المزرعة ❌',
      bodyAr: `لم تتم الموافقة على "${farm.name}". السبب: ${payload.reason}. يمكنك تعديلها وإعادة التقديم.`,
      referenceType: 'farm',
      referenceId: farm.id,
    });
    await this.bustFarmAndStats(farmId, farm.ownerId);

    return this.findOne(farmId);
  }

  async suspendFarm(farmId: string, payload: RejectionPayload): Promise<Farm> {
    const farm = await this.findOne(farmId);

    if (farm.status === FarmStatus.SUSPENDED) {
      throw new ConflictException('Farm is already suspended.');
    }

    await this.farmRepo.update(farmId, {
      status: FarmStatus.SUSPENDED,
      rejectionReason: payload.reason,
    });

    this.logger.warn(
      `Farm suspended [id=${farmId}] by admin [${payload.adminId}]`,
    );

    await this.notificationsService.notify(farm.ownerId, {
      type: NotificationType.FARM_SUSPENDED,
      title: 'Farm suspended ⚠️',
      body: `"${farm.name}" has been suspended. Reason: ${payload.reason}. Contact support for assistance.`,
      titleAr: 'تم تعليق المزرعة ⚠️',
      bodyAr: `تم تعليق "${farm.name}". السبب: ${payload.reason}. تواصل مع الدعم للمساعدة.`,
      referenceType: 'farm',
      referenceId: farm.id,
    });

    await this.bustFarmAndStats(farmId, farm.ownerId);

    return this.findOne(farmId);
  }

  async unsuspendFarm(farmId: string, payload: ApprovalPayload): Promise<Farm> {
    const farm = await this.findOne(farmId);

    if (farm.status !== FarmStatus.SUSPENDED) {
      throw new BadRequestException('Farm is not suspended.');
    }

    await this.farmRepo.update(farmId, {
      status: FarmStatus.APPROVED,
      rejectionReason: null,
    });

    this.logger.log(
      `Farm unsuspended [id=${farmId}] by admin [${payload.adminId}]`,
    );

    await this.notificationsService.notify(farm.ownerId, {
      type: NotificationType.FARM_APPROVED,
      title: 'Farm reactivated ✅',
      body: `"${farm.name}" has been reactivated and is now approved.`,
      titleAr: 'تمت إعادة تفعيل المزرعة ✅',
      bodyAr: `تمت إعادة تفعيل "${farm.name}" وهي معتمدة الآن.`,
      referenceType: 'farm',
      referenceId: farm.id,
    });
    await this.bustFarmAndStats(farmId, farm.ownerId);

    return this.findOne(farmId);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async softDelete(id: string, ownerId: string): Promise<void> {
    const farm = await this.findOne(id, ownerId);

    if (farm.status === FarmStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot delete an approved farm. Please contact support or suspend it first.',
      );
    }

    await this.farmRepo.update(id, { isDeleted: true, deletedAt: new Date() });
    this.logger.log(`Farm soft-deleted [id=${id}] by owner [${ownerId}]`);

    await this.notificationsService.notify(farm.ownerId, {
      type: NotificationType.FARM_DELETED,
      title: 'Farm deleted 🗑️',
      body: `"${farm.name}" has been deleted.`,
      titleAr: 'تم حذف المزرعة 🗑️',
      bodyAr: `"${farm.name}" تم حذفها.`,
      referenceType: 'farm',
      referenceId: farm.id,
    });

    await Promise.all([
      this.bustFarmAndStats(id, ownerId),
      this.redis.del(CK.products(id)),
    ]);
  }

  /**
   * Admin hard-delete (permanent). Use with caution.
   */
  async hardDelete(farmId: string, adminId: string): Promise<void> {
    const farm = await this.findOne(farmId, undefined, true);

    // wipe all assets (media + documents) for this farm
    await this.deleteAllAssets(farmId);

    await this.farmRepo.remove(farm);
    this.logger.warn(`Farm hard-deleted [id=${farmId}] by admin [${adminId}]`);

    await Promise.all([
      this.bustFarmAndStats(farmId, farm.ownerId),
      this.redis.del(CK.products(farmId)),
    ]);
  }

  // ── Assets (media + documents) ──────────────────────────────────────────────
  // Single implementation parameterized by FarmAssetKind.

  /**
   * Uploads multiple files (images/videos/documents) for a farm in parallel.
   * Validates ownership before touching storage.
   */
  async uploadAssets(
    farmId: string,
    merchantId: string,
    files: Express.Multer.File[],
    kind: FarmAssetKind,
  ): Promise<FarmMedia[]> {
    await this.validateOwnership(farmId, merchantId);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    const uploaded = await Promise.all(
      files.map((file) => this.uploadService.upload(file, 'farm')),
    );

    const entities = uploaded.map((asset, index) =>
      this.mediaRepo.create({
        farmId,
        kind,
        url: asset.url,
        publicId: asset.publicId,
        mediaType: files[index].mimetype.startsWith('video/')
          ? MediaType.VIDEO
          : MediaType.IMAGE,
        sortOrder: index,
      }),
    );

    const saved = await this.mediaRepo.save(entities);

    if (kind === FarmAssetKind.MEDIA) {
      await this.redis.del(CK.one(farmId));
    }

    return saved;
  }

  /**
   * Deletes a single asset row (media or document) and its storage object.
   */
  async deleteAsset(
    farmId: string,
    assetId: string,
    merchantId: string,
    kind: FarmAssetKind,
  ): Promise<void> {
    await this.validateOwnership(farmId, merchantId);

    const asset = await this.mediaRepo.findOne({
      where: { id: assetId, farmId, kind },
    });

    if (!asset) {
      throw new NotFoundException(
        kind === FarmAssetKind.DOCUMENT
          ? 'Document not found'
          : 'Media not found',
      );
    }

    if (asset.publicId) {
      await this.uploadService.delete(asset.publicId);
    }

    await this.mediaRepo.delete(assetId);

    if (kind === FarmAssetKind.MEDIA) {
      await this.redis.del(CK.one(farmId));
    }
  }

  /**
   * Deletes ALL assets (media + documents) for a farm. Call this from
   * hardDelete()/softDelete() flows so storage objects don't leak.
   */
  async deleteAllAssets(farmId: string): Promise<void> {
    const allAssets = await this.mediaRepo.find({ where: { farmId } });

    await Promise.all(
      allAssets
        .filter((a) => a.publicId)
        .map((a) => this.uploadService.delete(a.publicId)),
    );

    await this.mediaRepo.delete({ farmId });
  }
  // ── Products ────────────────────────────────────────────────────────────────

  async getFarmProducts(farmId: string, requesterId?: string) {
    const farm = await this.findOne(farmId, requesterId);

    if (farm.status !== FarmStatus.APPROVED) {
      throw new BadRequestException(
        'Products are only available on approved farms.',
      );
    }
    const cacheKey = CK.products(farmId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Product[];

    const products = farm.products ?? [];
    await this.redis.set(cacheKey, JSON.stringify(products), TTL.farmProducts);
    return products;
  }

  // ── Stats (Admin Dashboard) ─────────────────────────────────────────────────

  async getStats(ownerId?: string): Promise<FarmStats> {
    const cacheKey = CK.stats(ownerId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as FarmStats;

    const qb = this.farmRepo
      .createQueryBuilder('farm')
      .where('farm.isDeleted = false');

    if (ownerId) qb.andWhere('farm.ownerId = :ownerId', { ownerId });

    const rows = await qb
      .select('farm.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('farm.status')
      .getRawMany<{ status: FarmStatus; count: string }>();

    const base: FarmStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      base.total += count;

      switch (row.status) {
        case FarmStatus.PENDING:
          base.pending = count;
          break;
        case FarmStatus.APPROVED:
          base.approved = count;
          break;
        case FarmStatus.REJECTED:
          base.rejected = count;
          break;
        case FarmStatus.SUSPENDED:
          base.suspended = count;
          break;
      }
    }
    await this.redis.set(cacheKey, JSON.stringify(base), TTL.stats);

    return base;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async assertNoDuplicateName(
    ownerId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.farmRepo.findOne({
      where: { ownerId, name: ILike(name), isDeleted: false },
    });
    if (existing) {
      throw new ConflictException(
        `You already have a farm named "${name}". Please choose a different name.`,
      );
    }
  }

  private async validateOwnership(
    farmId: string,
    merchantId: string,
  ): Promise<Farm> {
    const farm = await this.farmRepo.findOne({
      where: { id: farmId, isDeleted: false },
    });

    if (!farm) {
      throw new NotFoundException('Farm not found');
    }

    if (farm.ownerId !== merchantId) {
      throw new ForbiddenException(
        'You do not have permission to modify this farm',
      );
    }

    return farm;
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────────

  private async bustFarmAndStats(
    farmId: string,
    ownerId: string,
  ): Promise<void> {
    await Promise.all([
      this.redis.del(CK.one(farmId)),
      this.redis.del(CK.stats()),
      this.redis.del(CK.stats(ownerId)),
    ]);
  }

  private async bustStats(ownerId: string): Promise<void> {
    await Promise.all([
      this.redis.del(CK.stats()),
      this.redis.del(CK.stats(ownerId)),
    ]);
  }
}
