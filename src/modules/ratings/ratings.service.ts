import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Rating, RatingFlag, FlagStatus } from './entities/rating.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../shared/pagination/pagination.helper';
import { NotificationsService } from '../notifications/services/notifications.service';
import { NotificationType } from 'src/common/enums/notification.enum';
import { CreateRatingDto } from './dto/creat-rating.dto';
import {
  FlagRatingDto,
  ReviewFlagDto,
  UpdateRatingDto,
} from './dto/flag-rating.dto';
import { RedisService } from 'src/shared/redis/redis.service';

// ── Cache constants ────────────────────────────────────────────────────────────

const TTL = {
  rating: 60 * 10, // 10 min — single rating detail
  list: 60 * 3, // 3 min  — paginated lists (can't bust all page variants)
} as const;

const CK = {
  one: (id: string) => `ratings:one:${id}`,
  byUser: (userId: string, page: number, limit: number) =>
    `ratings:user:${userId}:${page}:${limit}`,
  given: (reviewerId: string, page: number, limit: number) =>
    `ratings:given:${reviewerId}:${page}:${limit}`,
  // Cross-service: bust the users cache when ratingAvg/ratingCount change
  userRow: (id: string) => `users:id:${id}`,
  userPublic: (id: string) => `users:public:${id}`,
  userStats: (id: string) => `users:stats:${id}`,
} as const;

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingsRepo: Repository<Rating>,

    @InjectRepository(RatingFlag)
    private readonly flagsRepo: Repository<RatingFlag>,

    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,

    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,

    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(reviewerId: string, dto: CreateRatingDto): Promise<Rating> {
    const order = await this.ordersRepo.findOne({
      where: { id: dto.orderId },
      relations: ['buyer', 'merchant'],
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed orders');
    }

    let reviewedId: string;
    if (order.buyerId === reviewerId) {
      reviewedId = order.merchantId;
    } else if (order.merchantId === reviewerId) {
      reviewedId = order.buyerId;
    } else {
      throw new ForbiddenException('You are not part of this order');
    }

    const existing = await this.ratingsRepo.findOne({
      where: { orderId: dto.orderId, reviewerId },
    });
    if (existing) {
      throw new ConflictException('You have already rated this order');
    }

    const rating = this.ratingsRepo.create({
      orderId: dto.orderId,
      reviewerId,
      reviewedId,
      score: dto.score,
      comment: dto.comment,
    });

    const saved = await this.ratingsRepo.save(rating);

    await this.recalculateRating(reviewedId);

    const reviewer = await this.usersRepo.findOne({
      where: { id: reviewerId },
    });

    await this.notificationsService.notify(reviewedId, {
      type: NotificationType.RATING_RECEIVED,
      title: 'New Rating Received ⭐',
      body: `${reviewer?.fullName ?? 'Someone'} rated you ${dto.score}/5 stars`,
      titleAr: 'تقييم جديد ⭐',
      bodyAr: `${reviewer?.fullName ?? 'أحد المستخدمين'} قيّمك بـ ${dto.score} من 5 نجوم`,
      referenceType: 'rating',
      referenceId: saved.id,
    });

    return saved;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    ratingId: string,
    reviewerId: string,
    dto: UpdateRatingDto,
  ): Promise<Rating> {
    const rating = await this.ratingsRepo.findOne({ where: { id: ratingId } });

    if (!rating) throw new NotFoundException('Rating not found');
    if (rating.reviewerId !== reviewerId) {
      throw new ForbiddenException('You can only edit your own ratings');
    }

    Object.assign(rating, dto);
    const saved = await this.ratingsRepo.save(rating);
    await Promise.all([
      this.redis.del(CK.one(ratingId)),
      this.recalculateRating(rating.reviewedId),
    ]);
    return saved;
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Rating> {
    const cached = await this.redis.get(CK.one(id));
    if (cached) return JSON.parse(cached) as Rating;

    const rating = await this.ratingsRepo.findOne({
      where: { id },
      relations: ['reviewer', 'reviewed', 'order'],
    });
    if (!rating) throw new NotFoundException('Rating not found');
    await this.redis.set(CK.one(id), JSON.stringify(rating), TTL.rating);

    return rating;
  }

  // ─── Ratings received by a user ───────────────────────────────────────────

  async getByUser(userId: string, pagination: PaginationDto) {
    const page = Number(pagination.page);
    const limit = Number(pagination.limit);

    const cacheKey = CK.byUser(userId, page, limit);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Rating[];

    const qb = this.ratingsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewer', 'reviewer')
      .leftJoinAndSelect('r.order', 'order')
      .where('r.reviewedId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC');

    const result = await paginate(qb, page, limit);
    await this.redis.set(cacheKey, JSON.stringify(result), TTL.list);
    return result;
  }

  // ─── Ratings submitted by the current user ────────────────────────────────

  async getGiven(reviewerId: string, pagination: PaginationDto) {
    const page = Number(pagination.page);
    const limit = Number(pagination.limit);
    const cacheKey = CK.given(reviewerId, page, limit);

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Rating[];

    const qb = this.ratingsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewed', 'reviewed')
      .leftJoinAndSelect('r.order', 'order')
      .where('r.reviewerId = :reviewerId', { reviewerId })
      .orderBy('r.createdAt', 'DESC');

    const result = await paginate(qb, page, limit);
    await this.redis.set(cacheKey, JSON.stringify(result), TTL.list);
    return result;
  }

  // ─── Flag a rating ────────────────────────────────────────────────────────

  async flagRating(
    ratingId: string,
    reporterId: string,
    dto: FlagRatingDto,
  ): Promise<RatingFlag> {
    const rating = await this.ratingsRepo.findOne({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Rating not found');

    if (rating.reviewedId !== reporterId) {
      throw new ForbiddenException(
        'You can only flag ratings submitted about you',
      );
    }

    const existing = await this.flagsRepo.findOne({
      where: { ratingId, reporterId },
    });

    if (existing)
      throw new ConflictException('You have already flagged this rating');

    const flag = this.flagsRepo.create({
      ratingId,
      reporterId,
      reason: dto.reason,
      notes: dto.notes,
      status: FlagStatus.PENDING,
    });

    return this.flagsRepo.save(flag);
  }

  // ─── Admin: list flags ────────────────────────────────────────────────────

  async getFlags(pagination: PaginationDto, status?: FlagStatus) {
    const qb = this.flagsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.rating', 'rating')
      .leftJoinAndSelect('f.reporter', 'reporter')
      .leftJoinAndSelect('rating.reviewer', 'reviewer')
      .leftJoinAndSelect('rating.reviewed', 'reviewed')
      .orderBy('f.createdAt', 'ASC');

    if (status) {
      qb.where('f.status = :status', { status });
    }

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  // ─── Admin: resolve a flag ────────────────────────────────────────────────

  async resolveFlag(flagId: string, dto: ReviewFlagDto): Promise<RatingFlag> {
    const flag = await this.flagsRepo.findOne({
      where: { id: flagId },
      relations: ['rating'],
    });

    if (!flag) throw new NotFoundException('Flag not found');
    if (flag.status !== FlagStatus.PENDING) {
      throw new BadRequestException('Flag has already been reviewed');
    }

    if (dto.status === FlagStatus.REMOVED) {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(RatingFlag, flagId, {
          status: FlagStatus.REMOVED,
          adminNotes: dto.adminNotes,
        });
        await manager.delete(Rating, flag.ratingId);
      });

      await Promise.all([
        this.redis.del(CK.one(flag.ratingId)),
        this.recalculateRating(flag.rating.reviewedId),
      ]);

      await this.notificationsService.notify(flag.reporterId, {
        type: NotificationType.RATING_RECEIVED,
        title: 'Your Report Was Reviewed ✅',
        body: 'Your flag was reviewed and the reported rating has been removed.',
        titleAr: 'تم مراجعة البلاغ ✅',
        bodyAr: 'تمت مراجعة بلاغك وإزالة التقييم المُبلَّغ عنه.',
        referenceType: 'flag',
        referenceId: flagId,
      });
    } else {
      await this.flagsRepo.update(flagId, {
        status: dto.status,
        adminNotes: dto.adminNotes,
      });
    }
    const updatedFlag = await this.flagsRepo.findOne({
      where: { id: flagId },
      relations: ['rating', 'reporter'],
    });
    if (!updatedFlag) throw new NotFoundException();
    return updatedFlag;
  }

  // ─── Admin: list all ratings ──────────────────────────────────────────────

  async getAllRatings(pagination: PaginationDto) {
    const qb = this.ratingsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewer', 'reviewer')
      .leftJoinAndSelect('r.reviewed', 'reviewed')
      .leftJoinAndSelect('r.order', 'order')
      .orderBy('r.createdAt', 'DESC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async recalculateRating(userId: string): Promise<void> {
    const result = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.reviewedId = :userId', { userId })
      .getRawOne<{ avg: string | null; count: string }>();

    await this.usersRepo.update(userId, {
      ratingAvg: parseFloat(parseFloat(result?.avg ?? '0').toFixed(2)),
      ratingCount: parseInt(result?.count ?? '0', 10),
    });
    // The user row changed — any cached copy is now stale
    await Promise.all([
      this.redis.del(CK.userRow(userId)),
      this.redis.del(CK.userPublic(userId)),
      this.redis.del(CK.userStats(userId)),
    ]);
  }
}
