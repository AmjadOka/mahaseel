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
import { Farm, FarmMedia } from './entities/farm.entity';
import { CreateFarmDto, UpdateFarmDto } from './dto/create-farm.dto';
import { FarmStatus } from 'src/common/enums/farm.enum';
import { NotificationsService } from '../notifications/services/notifications.service';
import { NotificationType } from 'src/common/enums/notification.enum';
import { UploadService } from '../upload/upload.service';
<<<<<<< HEAD
import { MediaType } from 'src/common/enums/platform.enum';
=======
>>>>>>> 668248664679d1294fd22e94ffd03177d03f73c1
// import { StorageService } from '../../shared/storage/storage.service';

// ─── DTOs / Types ────────────────────────────────────────────────────────────

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface FarmFilters {
  status?: FarmStatus;
  search?: string; // searches name / location
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
  totalAreaHectares: number;
}

export interface ApprovalPayload {
  adminId: string;
  note?: string;
}

export interface RejectionPayload extends ApprovalPayload {
  reason: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class FarmsService {
  private readonly logger = new Logger(FarmsService.name);

  constructor(
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(FarmMedia)
    private readonly mediaRepo: Repository<FarmMedia>,
    private readonly uploadService: UploadService,
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

    return saved;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Owner: paginated list of their own non-deleted farms.
   */
  async findMyFarms(
    ownerId: string,
    { page = 1, limit = 10 }: PaginationOptions = {},
    filters: Pick<FarmFilters, 'status' | 'search'> = {},
  ): Promise<PaginatedResult<Farm>> {
    const where: FindOptionsWhere<Farm> = { ownerId, isDeleted: false };

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

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin: paginated list of all farms with optional filters.
   */
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

  /**
   * Single farm – optionally scoped to an owner.
   * Pass `includeDeleted = true` for admin use-cases.
   */
  async findOne(
    id: string,
    ownerId?: string,
    includeDeleted = false,
  ): Promise<Farm> {
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

    // If re-submitting after rejection, reset to PENDING
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

    return saved;
  }

  // ── Admin: Approve ──────────────────────────────────────────────────────────

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

    return this.findOne(farmId);
  }

  // ── Admin: Reject ───────────────────────────────────────────────────────────

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

    return this.findOne(farmId);
  }

  // ── Admin: Suspend / Unsuspend ──────────────────────────────────────────────

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
  }

  /**
   * Uploads multiple images/videos for a farm in parallel.
   * Validates ownership before touching storage.
   */
  async uploadMedia(
    farmId: string,
    merchantId: string,
    files: Express.Multer.File[],
  ): Promise<FarmMedia[]> {
    await this.validateOwnership(farmId, merchantId);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    const uploaded = await Promise.all(
      files.map((file) => this.uploadService.upload(file, 'farm')),
    );

    const mediaEntities = uploaded.map((asset, index) =>
      this.mediaRepo.create({
        farmId,
        url: asset.url,
        publicId: asset.publicId,
        mediaType: files[index].mimetype.startsWith('video/')
          ? MediaType.VIDEO
          : MediaType.IMAGE,
        sortOrder: index,
      }),
    );

    return this.mediaRepo.save(mediaEntities);
  }

  /**
   * Deletes a single media row and its Cloudinary asset.
   */
  async deleteMedia(
    farmId: string,
    mediaId: string,
    merchantId: string,
  ): Promise<void> {
    await this.validateOwnership(farmId, merchantId);

    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, farmId },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    if (media.publicId) {
      await this.uploadService.delete(media.publicId);
    }

    await this.mediaRepo.delete(mediaId);
  }

  /**
   * Deletes ALL media for a farm — call this inside your deleteFarm() method
   * so Cloudinary assets are cleaned up when a farm is removed.
   */
  async deleteAllMedia(farmId: string): Promise<void> {
    const allMedia = await this.mediaRepo.find({ where: { farmId } });

    await Promise.all(
      allMedia
        .filter((m) => m.publicId)
        .map((m) => this.uploadService.delete(m.publicId!)),
    );

    await this.mediaRepo.delete({ farmId });
  }

  /**
   * Admin hard-delete (permanent). Use with caution.
   */
  async hardDelete(farmId: string, adminId: string): Promise<void> {
    const farm = await this.findOne(farmId, undefined, true);
    await this.farmRepo.remove(farm);
    this.logger.warn(`Farm hard-deleted [id=${farmId}] by admin [${adminId}]`);
  }

  // ── Products ────────────────────────────────────────────────────────────────

  /**
   * Returns the farm with its products relation loaded.
   * Caller can access `farm.products` for the full list.
   */
  async getFarmProducts(farmId: string, requesterId?: string) {
    const farm = await this.findOne(farmId, requesterId);

    if (farm.status !== FarmStatus.APPROVED) {
      throw new BadRequestException(
        'Products are only available on approved farms.',
      );
    }

    return farm.products ?? [];
  }

  // ── Stats (Admin Dashboard) ─────────────────────────────────────────────────

  async getStats(ownerId?: string): Promise<FarmStats> {
    const qb = this.farmRepo
      .createQueryBuilder('farm')
      .where('farm.isDeleted = false');

    if (ownerId) qb.andWhere('farm.ownerId = :ownerId', { ownerId });

    const rows = await qb
      .select('farm.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(farm.areaHectares), 0)', 'totalArea')
      .groupBy('farm.status')
      .getRawMany<{ status: FarmStatus; count: string; totalArea: string }>();

    const base: FarmStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
      totalAreaHectares: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      base.total += count;
      base.totalAreaHectares += parseFloat(row.totalArea);

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

  /**
   * Confirms the farm exists and belongs to the requesting merchant.
   * Throws before any mutation touches storage or the DB.
   *
   * @throws NotFoundException   – farm does not exist or is soft-deleted
   * @throws ForbiddenException  – farm exists but belongs to a different owner
   */
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
}
