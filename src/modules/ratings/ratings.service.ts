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
import { FlagRatingDto, ReviewFlagDto } from './dto/flag-rating.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private ratingsRepo: Repository<Rating>,

    @InjectRepository(RatingFlag)
    private flagsRepo: Repository<RatingFlag>,

    @InjectRepository(Order)
    private ordersRepo: Repository<Order>,

    @InjectRepository(User)
    private usersRepo: Repository<User>,

    private dataSource: DataSource,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(reviewerId: string, dto: CreateRatingDto): Promise<Rating> {
    const order = await this.ordersRepo.findOne({
      where: { id: dto.orderId },
      relations: ['buyer', 'merchant'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed orders');
    }

    // Determine direction
    let reviewedId: string;
    if (order.buyerId === reviewerId) {
      reviewedId = order.merchantId;
    } else if (order.merchantId === reviewerId) {
      reviewedId = order.buyerId;
    } else {
      throw new ForbiddenException('You are not part of this order');
    }

    // Fix: check by BOTH orderId AND reviewerId so both parties can submit
    const existing = await this.ratingsRepo.findOne({
      where: { orderId: dto.orderId, reviewerId },
    });
    if (existing)
      throw new BadRequestException('You have already rated this order');

    const rating = this.ratingsRepo.create({
      orderId: dto.orderId,
      reviewerId,
      reviewedId,
      score: dto.score,
      comment: dto.comment,
    });

    const saved = await this.ratingsRepo.save(rating);

    // Recalculate reviewed user's stats
    await this.recalculateRating(reviewedId);

    // Notify the reviewed user
    const reviewer = await this.usersRepo.findOne({
      where: { id: reviewerId },
    });
    await this.notificationsService.notify(reviewedId, {
      type: NotificationType.RATING_RECEIVED,
      title: '',
      body: '',
      titleAr: 'تقييم جديد',
      bodyAr: `${reviewer?.fullName ?? 'أحد المستخدمين'} قيّمك بـ ${dto.score} من 5 نجوم`,
      referenceType: 'rating',
      referenceId: saved.id,
    });

    return saved;
  }

  // ─── Flag (report) a rating ───────────────────────────────────────────────

  async flagRating(
    ratingId: string,
    reporterId: string,
    dto: FlagRatingDto,
  ): Promise<RatingFlag> {
    const rating = await this.ratingsRepo.findOne({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Rating not found');

    // Only the reviewed user can flag a rating against them
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

  // ─── Admin: list pending flags ────────────────────────────────────────────

  async getPendingFlags(pagination: PaginationDto) {
    const qb = this.flagsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.rating', 'rating')
      .leftJoinAndSelect('f.reporter', 'reporter')
      .leftJoinAndSelect('rating.reviewer', 'reviewer')
      .leftJoinAndSelect('rating.reviewed', 'reviewed')
      .where('f.status = :status', { status: FlagStatus.PENDING })
      .orderBy('f.createdAt', 'ASC');
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

    // If admin decides to remove the rating entirely
    if (dto.status === FlagStatus.REMOVED) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(Rating, flag.ratingId);
        await manager.update(RatingFlag, flagId, {
          status: FlagStatus.REMOVED,
          adminNotes: dto.adminNotes,
        });
        // Recalculate the affected user's rating after deletion
        await this.recalculateRating(flag.rating.reviewedId);
      });

      // Notify the reporter that action was taken
      await this.notificationsService.notify(flag.reporterId, {
        type: NotificationType.RATING_RECEIVED,
        title: '',
        body: '',
        titleAr: 'تم مراجعة البلاغ',
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
    const updated = await this.flagsRepo.findOne({ where: { id: flagId } });
    if (!updated) throw new NotFoundException('Flag not found, err happen');
    return updated;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getByUser(userId: string, pagination: PaginationDto) {
    const qb = this.ratingsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewer', 'reviewer')
      .leftJoinAndSelect('r.order', 'order')
      .where('r.reviewedId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC');
    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getGiven(reviewerId: string, pagination: PaginationDto) {
    const qb = this.ratingsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewed', 'reviewed')
      .where('r.reviewerId = :reviewerId', { reviewerId })
      .orderBy('r.createdAt', 'DESC');
    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  // ─── Private ──────────────────────────────────────────────────────────────

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
  }
}
