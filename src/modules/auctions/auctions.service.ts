import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource } from 'typeorm';

import { AuctionBid } from './entities/auction-bid.entity';
import { PlaceBidDto } from './dto/create-bid.dto';
import { NotificationsService } from '../notifications/services/notifications.service';
import { AuctionsGateway } from './auctions.gateway';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { RedisService } from 'src/shared/redis/redis.service';

import { ProductStatus } from 'src/common/enums/product.enum';
import { BidStatus } from 'src/common/enums/bid.enum';
import { NotificationType } from 'src/common/enums/notification.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum';
import { UploadService } from '../upload/upload.service';

type LoserRow = { buyerId: string };

// ── Lock constants ─────────────────────────────────────────────────────────────

/**
 * TTL for auction locks.
 * Must be longer than the slowest operation inside the lock (the DB transaction).
 * Stripe calls happen AFTER the lock is released so 15 s is safe.
 */
const AUCTION_LOCK_TTL_MS = 15_000;

const LOCK_KEY = (productId: string) => `lock:auction:${productId}`;

// modules/auctions/auctions.cache.ts

const AUCTIONS_TTL = {
  bidsForProduct: 60 * 2, // 2 min — merchant bid list, busted on every bid change
  myBids: 60 * 2, // 2 min — buyer's active bids, busted on every bid change
} as const;

const AUCTIONS_CK = {
  bidsForProduct: (productId: string) => `auctions:bids:product:${productId}`,
  myBids: (buyerId: string) => `auctions:bids:buyer:${buyerId}`,
} as const;
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AuctionsService {
  constructor(
    @InjectRepository(AuctionBid)
    private bidsRepo: Repository<AuctionBid>,

    @InjectRepository(Product)
    private productsRepo: Repository<Product>,

    private notificationsService: NotificationsService,
    private auctionsGateway: AuctionsGateway,
    private paymentsService: PaymentsService,
    private ordersService: OrdersService,
    private readonly uploadService: UploadService,
    private readonly redis: RedisService,
    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PLACE BID
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Places a new bid on an active auction product.
   *
   * Race condition protection:
   * - Redis lock (LOCK_KEY) prevents concurrent bids, acceptBid, and
   *   closeExpiredAuctions from running simultaneously on the same product.
   * - Pessimistic write lock inside the transaction is a second safety net
   *   for cases where the Redis lock is unavailable.
   */
  async placeBid(
    buyerId: string,
    dto: PlaceBidDto,
    ipAddress?: string,
  ): Promise<AuctionBid> {
    // ── Acquire distributed lock ───────────────────────────────────────────
    const lockToken = await this.redis.acquireLock(
      LOCK_KEY(dto.productId),
      AUCTION_LOCK_TTL_MS,
    );

    if (!lockToken) {
      throw new ConflictException(
        'Auction is currently being updated. Please try again in a moment.',
      );
    }

    let savedBid: AuctionBid;
    let productName: string;
    let merchantId: string;
    let totalBids: number;

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // ── 1. Lock and verify product ────────────────────────────────────
        const product = await queryRunner.manager
          .createQueryBuilder(Product, 'product')
          .setLock('pessimistic_write')
          .where('product.id = :id', { id: dto.productId })
          .andWhere('product.isDeleted = false')
          .getOne();

        if (!product) throw new NotFoundException('Product not found');
        if (product.saleMethod !== SaleMethod.AUCTION)
          throw new BadRequestException('This product is not an auction');
        if (product.status !== ProductStatus.ACTIVE)
          throw new BadRequestException('Auction is not active');
        if (new Date() > product.auctionEndAt)
          throw new BadRequestException('Auction has ended');
        if (product.merchantId === buyerId)
          throw new ForbiddenException('You cannot bid on your own product');

        // ── 2. Validate bid amount ────────────────────────────────────────
        const minBid = Number(product.currentBid ?? product.auctionStartPrice);
        if (!Number.isFinite(dto.amount) || dto.amount <= 0)
          throw new BadRequestException('Bid amount must be a positive number');
        if (dto.amount <= minBid)
          throw new BadRequestException(
            `Bid must be greater than current bid: ${minBid}`,
          );

        // ── 3. Mark buyer's previous active bid LOST ──────────────────────
        await queryRunner.manager
          .getRepository(AuctionBid)
          .update(
            { productId: dto.productId, buyerId, status: BidStatus.ACTIVE },
            { status: BidStatus.LOST },
          );

        // ── 4. Save new bid ───────────────────────────────────────────────
        const bid = queryRunner.manager.create(AuctionBid, {
          productId: dto.productId,
          buyerId,
          amount: dto.amount,
          status: BidStatus.ACTIVE,
          ipAddress,
        });
        savedBid = await queryRunner.manager.save(AuctionBid, bid);

        // ── 5. Update product's current bid ──────────────────────────────
        product.currentBid = dto.amount;
        await queryRunner.manager.save(Product, product);

        productName = product.name;
        merchantId = product.merchantId;

        await queryRunner.commitTransaction();

        totalBids = await this.bidsRepo.count({
          where: { productId: dto.productId },
        });
      } catch (error) {
        if (queryRunner.isTransactionActive)
          await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } finally {
      await this.redis.releaseLock(LOCK_KEY(dto.productId), lockToken);
    }

    // ── Post-commit side-effects (outside lock — Stripe/notifications are slow) ──
    this.auctionsGateway.emitBidUpdate(dto.productId, {
      bidId: savedBid.id,
      amount: dto.amount,
      totalBids,
    });

    await this.notificationsService.notify(merchantId, {
      type: NotificationType.BID_PLACED,
      title: '',
      body: '',
      titleAr: 'عرض مزاد جديد',
      bodyAr: `وصل عرض جديد على "${productName}" بمبلغ ${dto.amount}`,
      referenceType: 'product',
      referenceId: dto.productId,
    });

    return savedBid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WITHDRAW BID
  // ─────────────────────────────────────────────────────────────────────────

  async withdrawBid(bidId: string, buyerId: string): Promise<void> {
    // Load bid first to know which product to lock
    const bidSnapshot = await this.bidsRepo.findOne({
      where: { id: bidId, buyerId },
    });
    if (!bidSnapshot) throw new NotFoundException('Bid not found');

    const lockToken = await this.redis.acquireLock(
      LOCK_KEY(bidSnapshot.productId),
      AUCTION_LOCK_TTL_MS,
    );

    if (!lockToken) {
      throw new ConflictException(
        'Auction is currently being updated. Please try again in a moment.',
      );
    }

    let productId: string;
    let newCurrentBid: number | null;

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const bid = await queryRunner.manager
          .getRepository(AuctionBid)
          .findOne({ where: { id: bidId, buyerId } });

        if (!bid) throw new NotFoundException('Bid not found');
        if (bid.status !== BidStatus.ACTIVE)
          throw new BadRequestException('Bid is no longer active');

        const product = await queryRunner.manager
          .createQueryBuilder(Product, 'product')
          .setLock('pessimistic_write')
          .where('product.id = :id', { id: bid.productId })
          .getOne();

        if (!product) throw new NotFoundException('Product not found');
        if (product.status !== ProductStatus.ACTIVE)
          throw new BadRequestException(
            'Cannot withdraw from a closed auction',
          );

        bid.status = BidStatus.WITHDRAWN;
        await queryRunner.manager.save(AuctionBid, bid);

        const nextHighest = await queryRunner.manager
          .getRepository(AuctionBid)
          .findOne({
            where: { productId: bid.productId, status: BidStatus.ACTIVE },
            order: { amount: 'DESC' },
          });

        product.currentBid = nextHighest ? nextHighest.amount : null;
        await queryRunner.manager.save(Product, product);

        productId = bid.productId;
        newCurrentBid = product.currentBid;

        await queryRunner.commitTransaction();
      } catch (error) {
        if (queryRunner.isTransactionActive)
          await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } finally {
      await this.redis.releaseLock(LOCK_KEY(bidSnapshot.productId), lockToken);
    }

    this.auctionsGateway.emitBidUpdate(productId, {
      currentBid: newCurrentBid,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCEPT BID  (merchant early-close)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Race condition fixed:
   *
   * Previously, the product status pre-check happened OUTSIDE the transaction.
   * closeExpiredAuctions could mark the product SOLD between that check and the
   * transaction start — creating two orders for the same auction.
   *
   */
  async acceptBid(
    bidId: string,
    merchantId: string,
  ): Promise<{ orderId: string; bid: AuctionBid | null }> {
    const bidSnapshot = await this.bidsRepo.findOne({
      where: { id: bidId, status: BidStatus.ACTIVE },
      relations: ['product', 'buyer'],
    });

    if (!bidSnapshot)
      throw new NotFoundException('Bid not found or no longer active');
    if (bidSnapshot.product.merchantId !== merchantId)
      throw new ForbiddenException('Access denied');

    // ── Acquire lock before any status checks ──────────────────────────────
    const lockToken = await this.redis.acquireLock(
      LOCK_KEY(bidSnapshot.productId),
      AUCTION_LOCK_TTL_MS,
    );

    if (!lockToken) {
      throw new ConflictException(
        'Auction is currently being updated. Please try again in a moment.',
      );
    }

    let createdOrder: Order | null = null;
    const bid = bidSnapshot;

    try {
      // ── Re-verify status INSIDE the lock ────────────────────────────────
      // This replaces the pre-check that was outside the transaction.
      // Any concurrent operation (closeExpiredAuctions) that changed the
      // product status will have already released the lock, so we see
      // the final state here.
      const freshProduct = await this.productsRepo.findOne({
        where: { id: bid.productId },
      });

      if (!freshProduct || freshProduct.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException('Auction is not active');
      }

      const freshBid = await this.bidsRepo.findOne({
        where: { id: bidId, status: BidStatus.ACTIVE },
      });

      if (!freshBid) {
        throw new NotFoundException('Bid is no longer active');
      }

      // ── Transaction ──────────────────────────────────────────────────────
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(AuctionBid)
          .update(
            { productId: bid.productId, status: BidStatus.ACTIVE },
            { status: BidStatus.LOST },
          );

        await manager
          .getRepository(AuctionBid)
          .update({ id: bid.id }, { status: BidStatus.WON });

        await manager
          .getRepository(Product)
          .update(
            { id: bid.productId },
            { status: ProductStatus.SOLD, quantity: 0 },
          );

        createdOrder = await this.ordersService.createAuctionOrder(
          manager,
          bid.productId,
          merchantId,
          bid.buyerId,
          Number(bid.amount),
          Number(bid.product.quantity),
        );
      });
    } finally {
      await this.redis.releaseLock(LOCK_KEY(bid.productId), lockToken);
    }

    if (!createdOrder) {
      throw new Error(
        'Order creation failed: transaction did not produce an order',
      );
    }

    const order = createdOrder as Order;

    // ── Post-commit side-effects (outside lock) ────────────────────────────
    this.auctionsGateway.emitAuctionClosed(
      bid.productId,
      bid.buyerId,
      bid.amount,
    );

    await this.paymentsService.autoInitiateForOrder(
      order.id,
      bid.buyerId,
      bid.buyer.email,
      bid.product.name,
      Number(bid.amount),
    );

    await this.notificationsService.notify(bid.buyerId, {
      type: NotificationType.AUCTION_WON,
      title: '',
      body: '',
      titleAr: 'فزت بالمزاد! 🎉',
      bodyAr: `لقد فزت بمزاد "${bid.product.name}" بمبلغ ${bid.amount}. تحقق من بريدك الإلكتروني لرابط الدفع.`,
      referenceType: 'order',
      referenceId: order.id,
    });

    const losers: LoserRow[] = await this.bidsRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.buyerId', 'buyerId')
      .where('b.productId = :productId', { productId: bid.productId })
      .andWhere('b.status = :status', { status: BidStatus.LOST })
      .andWhere('b.buyerId != :winnerId', { winnerId: bid.buyerId })
      .getRawMany();

    await Promise.all(
      losers.map((loser) =>
        this.notificationsService.notify(loser.buyerId, {
          title: '',
          body: '',
          type: NotificationType.AUCTION_LOST,
          titleAr: 'انتهى المزاد',
          bodyAr: `انتهى المزاد على "${bid.product.name}". شكراً لمشاركتك.`,
          referenceType: 'product',
          referenceId: bid.productId,
        }),
      ),
    );

    return {
      orderId: order.id,
      bid: await this.bidsRepo.findOne({
        where: { id: bidId },
        relations: ['buyer', 'product'],
      }),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLOSE EXPIRED AUCTIONS  (cron — every minute)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Each product is locked individually before processing.
   * If acceptBid already closed an auction before this cron reached it,
   * the lock acquisition will either:
   * - Block until acceptBid releases (then the re-lock inside the transaction
   *   finds status = SOLD and skips silently), or
   * - Find the product already non-ACTIVE and skip it in the re-lock check.
   */
  async closeExpiredAuctions(): Promise<void> {
    const expiredProducts = await this.productsRepo.find({
      where: {
        saleMethod: SaleMethod.AUCTION,
        status: ProductStatus.ACTIVE,
        auctionEndAt: LessThan(new Date()),
      },
    });

    for (const expiredProduct of expiredProducts) {
      // ── Acquire per-product lock ───────────────────────────────────────
      const lockToken = await this.redis.acquireLock(
        LOCK_KEY(expiredProduct.id),
        AUCTION_LOCK_TTL_MS,
      );

      if (!lockToken) {
        // Another process (acceptBid or a previous cron run) is handling this
        // product — skip it and let that process finish.
        continue;
      }

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      let createdOrder: Order | null = null;

      try {
        // ── Re-lock and re-verify inside transaction ─────────────────────
        const product = await queryRunner.manager
          .createQueryBuilder(Product, 'product')
          .setLock('pessimistic_write')
          .where('product.id = :id', { id: expiredProduct.id })
          .andWhere('product.status = :status', {
            status: ProductStatus.ACTIVE,
          })
          .getOne();

        // Already closed by acceptBid after our Redis lock was acquired — skip
        if (!product) {
          await queryRunner.rollbackTransaction();
          continue;
        }

        const topBid = await queryRunner.manager
          .getRepository(AuctionBid)
          .findOne({
            where: { productId: product.id, status: BidStatus.ACTIVE },
            order: { amount: 'DESC' },
            relations: ['buyer'],
          });

        if (topBid) {
          await queryRunner.manager
            .getRepository(AuctionBid)
            .update(
              { productId: product.id, status: BidStatus.ACTIVE },
              { status: BidStatus.LOST },
            );

          await queryRunner.manager
            .getRepository(AuctionBid)
            .update({ id: topBid.id }, { status: BidStatus.WON });

          await queryRunner.manager
            .getRepository(Product)
            .update(
              { id: product.id },
              { status: ProductStatus.SOLD, quantity: 0 },
            );

          createdOrder = await this.ordersService.createAuctionOrder(
            queryRunner.manager,
            product.id,
            product.merchantId,
            topBid.buyerId,
            Number(topBid.amount),
            Number(product.quantity),
          );

          await queryRunner.commitTransaction();

          // ── Release lock before Stripe ───────────────────────────────
          await this.redis.releaseLock(LOCK_KEY(expiredProduct.id), lockToken);

          // ── Post-commit: winner path ─────────────────────────────────
          this.auctionsGateway.emitAuctionClosed(
            product.id,
            topBid.buyerId,
            topBid.amount,
          );

          await this.paymentsService.autoInitiateForOrder(
            createdOrder.id,
            topBid.buyerId,
            topBid.buyer.email,
            product.name,
            Number(topBid.amount),
          );

          await this.notificationsService.notify(topBid.buyerId, {
            type: NotificationType.AUCTION_WON,
            title: '',
            body: '',
            titleAr: 'فزت بالمزاد! 🎉',
            bodyAr: `لقد فزت بمزاد "${product.name}" بمبلغ ${topBid.amount}. تحقق من بريدك الإلكتروني لرابط الدفع.`,
            referenceType: 'order',
            referenceId: createdOrder.id,
          });

          const losers: LoserRow[] = await this.bidsRepo
            .createQueryBuilder('b')
            .select('DISTINCT b.buyerId', 'buyerId')
            .where('b.productId = :productId', { productId: product.id })
            .andWhere('b.status = :status', { status: BidStatus.LOST })
            .andWhere('b.buyerId != :winnerId', { winnerId: topBid.buyerId })
            .getRawMany();

          await Promise.all(
            losers.map((loser) =>
              this.notificationsService.notify(loser.buyerId, {
                title: '',
                body: '',
                type: NotificationType.AUCTION_LOST,
                titleAr: 'انتهى المزاد',
                bodyAr: `انتهى المزاد على "${product.name}". شكراً لمشاركتك.`,
                referenceType: 'product',
                referenceId: product.id,
              }),
            ),
          );
        } else {
          // ── No bids — mark EXPIRED ────────────────────────────────────
          await queryRunner.manager
            .getRepository(Product)
            .update({ id: product.id }, { status: ProductStatus.EXPIRED });

          await queryRunner.commitTransaction();

          // Release before notifications
          await this.redis.releaseLock(LOCK_KEY(expiredProduct.id), lockToken);

          this.auctionsGateway.emitAuctionClosed(product.id, null, null);

          await this.notificationsService.notify(product.merchantId, {
            title: '',
            body: '',
            type: NotificationType.AUCTION_LOST,
            titleAr: 'انتهى المزاد بدون عروض',
            bodyAr: `انتهى المزاد على "${product.name}" دون أي عروض.`,
            referenceType: 'product',
            referenceId: product.id,
          });
        }
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        // Release lock on error so the next cron run can retry
        await this.redis.releaseLock(LOCK_KEY(expiredProduct.id), lockToken);

        console.error(
          `[closeExpiredAuctions] Failed for product ${expiredProduct.id}:`,
          error,
        );
      } finally {
        await queryRunner.release();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  async getBidsForProduct(
    productId: string,
    merchantId: string,
  ): Promise<AuctionBid[]> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.merchantId !== merchantId)
      throw new ForbiddenException('Access denied');

    return this.bidsRepo.find({
      where: { productId },
      relations: ['buyer'],
      order: { amount: 'DESC' },
    });
  }

  async getMyBids(buyerId: string): Promise<AuctionBid[]> {
    return this.bidsRepo.find({
      where: { buyerId, status: BidStatus.ACTIVE },
      relations: ['product', 'product.media'],
      order: { createdAt: 'DESC' },
    });
  }

  async uploadImage(
    productId: string,
    merchantId: string,
    file: Express.Multer.File,
  ): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.merchantId !== merchantId)
      throw new ForbiddenException('You do not own this product');
    if (product.saleMethod !== SaleMethod.AUCTION)
      throw new BadRequestException('Product is not an auction');

    const uploaded = product.auctionImagePublicId
      ? await this.uploadService.replace(
          file,
          'auction',
          product.auctionImagePublicId,
        )
      : await this.uploadService.upload(file, 'auction');

    await this.productsRepo.update(productId, {
      auctionImageUrl: uploaded.url,
      auctionImagePublicId: uploaded.publicId,
    });

    const updatedProduct = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!updatedProduct) throw new NotFoundException();
    return updatedProduct;
  }

  async removeImage(productId: string, merchantId: string): Promise<void> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.merchantId !== merchantId)
      throw new ForbiddenException('You do not own this product');
    if (!product.auctionImagePublicId)
      throw new BadRequestException('No image to remove');

    await this.uploadService.delete(product.auctionImagePublicId);
    await this.productsRepo.update(productId, {
      auctionImageUrl: undefined,
      auctionImagePublicId: undefined,
    });
  }
}
