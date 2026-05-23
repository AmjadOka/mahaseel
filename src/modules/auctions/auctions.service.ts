// modules/auctions/auctions.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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

import { ProductStatus } from 'src/common/enums/product.enum';
import { BidStatus } from 'src/common/enums/bid.enum';
import { NotificationType } from 'src/common/enums/notification.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum';
import { UploadService } from '../upload/upload.service';

type LoserRow = { buyerId: string };

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
    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PLACE BID
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Places a new bid on an active auction product.
   *
   * Business rules:
   * - Product must be ACTIVE, AUCTION type, and not expired.
   * - Merchant cannot bid on their own product.
   * - Bid amount must strictly exceed current highest bid (or start price).
   * - Buyer's previous ACTIVE bid on this product is marked LOST before the new one is saved.
   * - Product.currentBid is updated atomically inside the transaction.
   *
   * Post-commit:
   * - WebSocket bid_update event is emitted to the auction room.
   * - Merchant is notified of the new bid.
   */
  async placeBid(
    buyerId: string,
    dto: PlaceBidDto,
    ipAddress?: string,
  ): Promise<AuctionBid> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedBid: AuctionBid;
    let productName: string;
    let merchantId: string;
    let totalBids: number;

    try {
      // ── 1. Lock and verify product ──────────────────────────────────────
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

      // ── 2. Validate bid amount ───────────────────────────────────────────
      const minBid = Number(product.currentBid ?? product.auctionStartPrice);
      if (!Number.isFinite(dto.amount) || dto.amount <= 0)
        throw new BadRequestException('Bid amount must be a positive number');
      if (dto.amount <= minBid)
        throw new BadRequestException(
          `Bid must be greater than current bid: ${minBid}`,
        );

      // ── 3. Mark buyer's previous active bid on this product as LOST ──────
      await queryRunner.manager
        .getRepository(AuctionBid)
        .update(
          { productId: dto.productId, buyerId, status: BidStatus.ACTIVE },
          { status: BidStatus.LOST },
        );

      // ── 4. Save new bid ──────────────────────────────────────────────────
      const bid = queryRunner.manager.create(AuctionBid, {
        productId: dto.productId,
        buyerId,
        amount: dto.amount,
        status: BidStatus.ACTIVE,
        ipAddress,
      });
      savedBid = await queryRunner.manager.save(AuctionBid, bid);

      // ── 5. Update product's current bid ─────────────────────────────────
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

    // ── Post-commit side-effects ─────────────────────────────────────────
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

  /**
   * Withdraws a buyer's active bid.
   *
   * After withdrawal, product.currentBid is updated to the next highest
   * active bid (or null if no bids remain).
   */
  async withdrawBid(bidId: string, buyerId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let productId: string;
    let newCurrentBid: number | null;

    try {
      // ── 1. Load and validate bid ─────────────────────────────────────────
      const bid = await queryRunner.manager
        .getRepository(AuctionBid)
        .findOne({ where: { id: bidId, buyerId } });

      if (!bid) throw new NotFoundException('Bid not found');
      if (bid.status !== BidStatus.ACTIVE)
        throw new BadRequestException('Bid is no longer active');

      // ── 2. Lock product ──────────────────────────────────────────────────
      const product = await queryRunner.manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_write')
        .where('product.id = :id', { id: bid.productId })
        .getOne();

      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== ProductStatus.ACTIVE)
        throw new BadRequestException('Cannot withdraw from a closed auction');

      // ── 3. Mark bid WITHDRAWN ────────────────────────────────────────────
      bid.status = BidStatus.WITHDRAWN;
      await queryRunner.manager.save(AuctionBid, bid);

      // ── 4. Recalculate current bid ───────────────────────────────────────
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

    // ── Post-commit side-effects ─────────────────────────────────────────
    this.auctionsGateway.emitBidUpdate(productId, {
      currentBid: newCurrentBid,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCEPT BID  (merchant early-close)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Merchant manually accepts a specific active bid, closing the auction early.
   *
   * Flow:
   * 1. All active bids on this product are marked LOST.
   * 2. The chosen bid is marked WON.
   * 3. Product is marked SOLD.
   * 4. An Order in AWAITING_PAYMENT is created via ordersService.createAuctionOrder()
   *    — all financials (platformFee, netAmount) are computed server-side there.
   *
   * Post-commit:
   * - auction_closed WebSocket event is emitted.
   * - Stripe Checkout Session is created; payment link sent to winner.
   * - Winner and losers are notified.
   *
   * Wallet is NOT credited here — that happens in the payment webhook after
   * the buyer completes payment.
   */
  async acceptBid(
    bidId: string,
    merchantId: string,
  ): Promise<{ orderId: string; bid: AuctionBid | null }> {
    // ── 1. Load bid with relations (outside transaction — read-only pre-check) ─
    const bid = await this.bidsRepo.findOne({
      where: { id: bidId, status: BidStatus.ACTIVE },
      relations: ['product', 'buyer'],
    });

    if (!bid) throw new NotFoundException('Bid not found or no longer active');
    if (bid.product.merchantId !== merchantId)
      throw new ForbiddenException('Access denied');
    if (bid.product.status !== ProductStatus.ACTIVE)
      throw new BadRequestException('Auction is not active');

    let createdOrder: Order | null = null;

    // ── 2. Transaction ────────────────────────────────────────────────────
    await this.dataSource.transaction(async (manager) => {
      // Mark all active bids on this product LOST
      await manager
        .getRepository(AuctionBid)
        .update(
          { productId: bid.productId, status: BidStatus.ACTIVE },
          { status: BidStatus.LOST },
        );

      // Re-mark the chosen bid as WON
      await manager
        .getRepository(AuctionBid)
        .update({ id: bid.id }, { status: BidStatus.WON });

      // Mark product SOLD
      await manager
        .getRepository(Product)
        .update(
          { id: bid.productId },
          { status: ProductStatus.SOLD, quantity: 0 },
        );

      // Delegate order creation fully to OrdersService — fees computed there
      createdOrder = await this.ordersService.createAuctionOrder(
        manager,
        bid.productId,
        merchantId,
        bid.buyerId,
        Number(bid.amount),
        Number(bid.product.quantity),
      );
    });

    if (!createdOrder) {
      throw new Error(
        'Order creation failed: transaction did not produce an order',
      );
    }

    const order = createdOrder as Order;

    // ── 3. Post-commit side-effects ──────────────────────────────────────
    this.auctionsGateway.emitAuctionClosed(
      bid.productId,
      bid.buyerId,
      bid.amount,
    );

    // Create Stripe Checkout Session — sends payment link by email + push
    await this.paymentsService.autoInitiateForOrder(
      order.id,
      bid.buyerId,
      bid.buyer.email,
      bid.product.name,
      Number(bid.amount),
    );

    // Notify winner
    await this.notificationsService.notify(bid.buyerId, {
      type: NotificationType.AUCTION_WON,
      title: '',
      body: '',
      titleAr: 'فزت بالمزاد! 🎉',
      bodyAr: `لقد فزت بمزاد "${bid.product.name}" بمبلغ ${bid.amount}. تحقق من بريدك الإلكتروني لرابط الدفع.`,
      referenceType: 'order',
      referenceId: order.id,
    });

    // Notify losing bidders
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
  // CLOSE EXPIRED AUCTIONS  (BullMQ cron — every minute)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scans for auctions whose `auctionEndAt` has passed and closes each one.
   *
   * For each expired auction:
   * - If there's a top bid: marks it WON, all others LOST, product SOLD,
   *   creates an Order in AWAITING_PAYMENT via ordersService.createAuctionOrder(),
   *   then initiates payment and notifies winner + losers.
   * - If no bids: marks product EXPIRED and notifies merchant.
   *
   * A failure in any single auction is caught and logged so the loop
   * continues processing remaining auctions.
   *
   * Wallet is NOT credited here — credited only by the payment webhook.
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
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      let createdOrder: Order | null = null;

      try {
        // ── 1. Re-lock product row ───────────────────────────────────────
        const product = await queryRunner.manager
          .createQueryBuilder(Product, 'product')
          .setLock('pessimistic_write')
          .where('product.id = :id', { id: expiredProduct.id })
          .andWhere('product.status = :status', {
            status: ProductStatus.ACTIVE,
          })
          .getOne();

        // Already closed by another worker — skip silently
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
          // ── 2. Mark all active bids LOST ──────────────────────────────
          await queryRunner.manager
            .getRepository(AuctionBid)
            .update(
              { productId: product.id, status: BidStatus.ACTIVE },
              { status: BidStatus.LOST },
            );

          // ── 3. Re-mark top bid WON ────────────────────────────────────
          await queryRunner.manager
            .getRepository(AuctionBid)
            .update({ id: topBid.id }, { status: BidStatus.WON });

          // ── 4. Mark product SOLD ──────────────────────────────────────
          await queryRunner.manager
            .getRepository(Product)
            .update(
              { id: product.id },
              { status: ProductStatus.SOLD, quantity: 0 },
            );

          // ── 5. Create order — fees computed inside createAuctionOrder ──
          createdOrder = await this.ordersService.createAuctionOrder(
            queryRunner.manager,
            product.id,
            product.merchantId,
            topBid.buyerId,
            Number(topBid.amount),
            Number(product.quantity),
          );

          await queryRunner.commitTransaction();

          // ── Post-commit: winner path ───────────────────────────────────
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

          // Notify losers
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
          // ── No bids — mark product EXPIRED ────────────────────────────
          await queryRunner.manager
            .getRepository(Product)
            .update({ id: product.id }, { status: ProductStatus.EXPIRED });

          await queryRunner.commitTransaction();

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

  /**
   * Returns all bids on a merchant's auction product, highest first.
   * Merchant ownership is verified before returning data.
   */
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

  /**
   * Returns all active bids placed by the authenticated buyer.
   */
  async getMyBids(buyerId: string): Promise<AuctionBid[]> {
    return this.bidsRepo.find({
      where: { buyerId, status: BidStatus.ACTIVE },
      relations: ['product', 'product.media'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Uploads or replaces the cover image for an auction product.
   * Validates the product is an auction and belongs to the merchant.
   */
  async uploadImage(
    productId: string,
    merchantId: string,
    file: Express.Multer.File,
  ): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.merchantId !== merchantId) {
      throw new ForbiddenException('You do not own this product');
    }

    if (product.saleMethod !== SaleMethod.AUCTION) {
      throw new BadRequestException('Product is not an auction');
    }

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

  /** Removes the auction cover image from Cloudinary and clears DB fields. */
  async removeImage(productId: string, merchantId: string): Promise<void> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.merchantId !== merchantId) {
      throw new ForbiddenException('You do not own this product');
    }

    if (!product.auctionImagePublicId) {
      throw new BadRequestException('No image to remove');
    }

    await this.uploadService.delete(product.auctionImagePublicId);

    await this.productsRepo.update(productId, {
      auctionImageUrl: undefined,
      auctionImagePublicId: undefined,
    });
  }
}
