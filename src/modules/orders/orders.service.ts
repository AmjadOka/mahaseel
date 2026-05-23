import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Order } from './entities/order.entity';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { NotificationsService } from '../notifications/services/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { paginate } from '../../shared/pagination/pagination.helper';
import { SaleMethod } from '../../common/enums/Unit.enum.ts';
import {
  DeliveryStatus,
  OrderStatus,
} from 'src/common/enums/order-status.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ProductStatus } from 'src/common/enums/product.enum';
import { NotificationType } from 'src/common/enums/notification.enum';
import { Role } from 'src/common/enums/role.enum';
import { AuthUser } from 'src/common/types';
import { DeliveryMethod } from 'src/common/enums/delivery.enum';
import { Product } from '../products/entities/product.entity';
import { BidStatus } from 'src/common/enums/bid.enum';
import { AuctionBid } from '../auctions/entities/auction-bid.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private repo: Repository<Order>,

    @InjectRepository(AuctionBid)
    private auctionBidsRepo: Repository<AuctionBid>,

    private notificationsService: NotificationsService,
    private walletService: WalletService,
    private paymentsService: PaymentsService,
    private config: ConfigService,
    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE ORDER
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Places a new fixed-price order for a product.
   *
   * Business rules enforced:
   * - Product must be ACTIVE and use FIXED sale method.
   * - A merchant cannot purchase their own product.
   * - Offered price and quantity must be positive and within available stock.
   * - A pessimistic write lock is acquired on the product row so that
   *   concurrent requests cannot collectively exceed available stock.
   *
   * Fee model:
   *   finalPrice   = offeredPrice
   *   platformFee  = finalPrice × (platformFeePercent / 100)
   *   netAmount    = finalPrice − platformFee  (credited to merchant on completion)
   *
   * @param buyerId - UUID of the authenticated buyer.
   * @param dto     - Order creation payload (productId, offeredPrice, quantity, notes).
   * @returns The newly created {@link Order} entity.
   */
  async createOrder(buyerId: string, dto: CreateOrderDto): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedOrderId: string;
    let productMerchantId: string;
    let productName: string;
    let isNewOrder = true;

    try {
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: dto.productId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== ProductStatus.ACTIVE)
        throw new BadRequestException('Product is not available');
      if (product.saleMethod !== SaleMethod.FIXED)
        throw new BadRequestException(
          'Use the auction endpoint for auction products',
        );
      if (product.merchantId === buyerId)
        throw new ForbiddenException('You cannot buy your own product');

      const quantity = Number(dto.quantity);
      const offeredPrice = Number(dto.offeredPrice);

      if (!offeredPrice || offeredPrice <= 0)
        throw new BadRequestException(
          'Offered price must be a positive number',
        );
      if (!quantity || quantity <= 0)
        throw new BadRequestException('Quantity must be a positive number');

      // ── Use availableQuantity if set, otherwise fall back to quantity ──────
      const effectiveStock =
        product.availableQuantity != null
          ? Number(product.availableQuantity)
          : Number(product.quantity);

      if (quantity > effectiveStock) {
        throw new BadRequestException(
          `Requested quantity (${quantity}) exceeds available stock (${effectiveStock})`,
        );
      }

      const feePercent = this.config.get<number>('app.platformFeePercent', 5);
      const finalPrice = offeredPrice;
      const platformFee = (finalPrice * feePercent) / 100;
      const netAmount = finalPrice - platformFee;

      if (netAmount < 0) {
        throw new BadRequestException(
          `Offered price is too low to cover platform fees. Minimum: ${(platformFee / feePercent) * 100 + 0.01}`,
        );
      }

      // ── Block if buyer has an in-progress order ────────────────────────────
      const blockedOrder = await queryRunner.manager.findOne(Order, {
        where: [
          {
            productId: dto.productId,
            buyerId,
            status: OrderStatus.AWAITING_PAYMENT,
          },
          {
            productId: dto.productId,
            buyerId,
            status: OrderStatus.ACCEPTED,
          },
        ],
      });

      if (blockedOrder) {
        throw new BadRequestException(
          'You already have an active order for this product. Complete or cancel it before placing a new one.',
        );
      }

      // ── Update existing PENDING order instead of creating a duplicate ──────
      const existingPendingOrder = await queryRunner.manager.findOne(Order, {
        where: {
          productId: dto.productId,
          buyerId,
          status: OrderStatus.PENDING,
        },
      });

      if (existingPendingOrder) {
        // Buyer is adjusting their pending order — just update it in place
        await queryRunner.manager.update(Order, existingPendingOrder.id, {
          offeredPrice,
          finalPrice,
          platformFee,
          netAmount,
          quantity,
          notes: dto.notes,
        });

        savedOrderId = existingPendingOrder.id;
        productMerchantId = product.merchantId;
        productName = product.name;
        isNewOrder = false;
      } else {
        // ── No existing order — create a fresh one ─────────────────────────
        const order = queryRunner.manager.create(Order, {
          productId: dto.productId,
          merchantId: product.merchantId,
          buyerId,
          saleMethod: SaleMethod.FIXED,
          offeredPrice,
          finalPrice,
          platformFee,
          netAmount,
          quantity,
          unit: product.unit,
          deliveryMethod: product.deliveryMethod,
          notes: dto.notes,
          status: OrderStatus.PENDING,
        });

        const saved = await queryRunner.manager.save(Order, order);

        savedOrderId = saved.id;
        productMerchantId = product.merchantId;
        productName = product.name;
        isNewOrder = true;
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    // ── Post-commit: notify merchant only for brand-new orders ───────────────
    //
    // If the buyer is just updating their existing pending order, the merchant
    // already received a notification when it was first placed — no need to
    // spam them again.
    if (isNewOrder) {
      await this.notificationsService.notify(productMerchantId!, {
        type: NotificationType.ORDER_PLACED,
        title: '',
        body: '',
        titleAr: 'طلب شراء جديد',
        bodyAr: `وصلك طلب شراء على منتج "${productName!}"`,
        referenceType: 'order',
        referenceId: savedOrderId!,
      });
    }

    return this.findOne(savedOrderId!);
  }

  /**
   * Internal — called only by AuctionsService within an existing transaction.
   * All values are derived server-side; no buyer input reaches this method.
   *
   * @param manager  - The transactional EntityManager (queryRunner.manager or dataSource.transaction manager)
   * @param productId - Verified product UUID (already locked in the calling transaction)
   * @param merchantId - Taken from product.merchantId, never from client
   * @param buyerId   - Taken from the winning AuctionBid row, never from client
   * @param amount    - Taken from the winning AuctionBid.amount, never from client
   * @param quantity  - Taken from product.quantity, never from client
   * @param unit      - Taken from product.unit, never from client
   * @param deliveryMethod - Taken from product.deliveryMethod, never from client
   */
  async createAuctionOrder(
    manager: EntityManager,
    productId: string,
    merchantId: string,
    buyerId: string,
    amount: number,
    quantity: number,
  ): Promise<Order> {
    // ── 1. Re-fetch and lock the product inside this transaction ──────────────
    // Even though the caller already locked it, we re-verify here so this
    // method is self-contained and safe if ever called from a new context.
    const product = await manager.findOne(Product, {
      where: { id: productId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.saleMethod !== SaleMethod.AUCTION)
      throw new BadRequestException('Product is not an auction product');
    if (product.merchantId !== merchantId)
      throw new ForbiddenException('Merchant mismatch — possible tampering');
    if (product.status !== ProductStatus.SOLD)
      throw new BadRequestException(
        'Product must be marked SOLD before creating an auction order',
      );

    // ── 2. Verify the winning bid actually exists and is WON ─────────────────
    // Prevents order creation if somehow called with a non-winning bid amount.
    const winningBid = await manager.getRepository(AuctionBid).findOne({
      where: {
        productId,
        buyerId,
        status: BidStatus.WON,
      },
    });

    if (!winningBid)
      throw new NotFoundException(
        'No winning bid found for this buyer on this product',
      );

    // ── 3. Ensure no order already exists for this auction ───────────────────
    // Guards against double-execution (e.g. cron fires while acceptBid is mid-flight).
    const duplicate = await manager.findOne(Order, {
      where: { productId, saleMethod: SaleMethod.AUCTION },
    });

    if (duplicate)
      throw new BadRequestException(
        'An order already exists for this auction product',
      );

    // ── 4. Verify buyer is not the merchant ──────────────────────────────────
    if (buyerId === merchantId)
      throw new ForbiddenException('Merchant cannot be the auction winner');

    // ── 5. Derive all financials server-side — never trust caller's math ─────
    const parsedAmount = Number(amount);
    const parsedQuantity = Number(quantity);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      throw new BadRequestException('Invalid bid amount');
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)
      throw new BadRequestException('Invalid product quantity');

    // Cross-check: amount must match the winning bid row exactly
    if (Number(winningBid.amount) !== parsedAmount)
      throw new BadRequestException(
        'Amount mismatch with winning bid — possible tampering',
      );

    const feePercent = this.config.get<number>('app.platformFeePercent', 5);
    const platformFee = Number(((parsedAmount * feePercent) / 100).toFixed(2));
    const netAmount = Number((parsedAmount - platformFee).toFixed(2));

    if (netAmount <= 0)
      throw new BadRequestException('Net amount after fees must be positive');

    // ── 6. Create the order ───────────────────────────────────────────────────
    const order = manager.create(Order, {
      productId,
      merchantId,
      buyerId,
      saleMethod: SaleMethod.AUCTION,
      offeredPrice: parsedAmount,
      finalPrice: parsedAmount,
      platformFee,
      netAmount,
      quantity: parsedQuantity,
      unit: product.unit,
      deliveryMethod: product.deliveryMethod,
      status: OrderStatus.AWAITING_PAYMENT,
      deliveryStatus: null,
      buyerPhoneRevealed: false,
    });

    return manager.save(Order, order);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ — BUYER / MERCHANT LISTS
  // ─────────────────────────────────────────────────────────────────────────────

  async getBuyerOrders(buyerId: string, pagination: PaginationDto) {
    const qb = this.repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('product.media', 'media')
      .where('o.buyerId = :buyerId', { buyerId })
      .orderBy('o.createdAt', 'DESC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getMerchantOrders(merchantId: string, pagination: PaginationDto) {
    const qb = this.repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .where('o.merchantId = :merchantId', { merchantId })
      .orderBy('o.createdAt', 'DESC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ — SINGLE ORDER
  // ─────────────────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Order> {
    const order = await this.repo.findOne({
      where: { id },
      relations: ['product', 'product.media', 'buyer', 'merchant', 'payment'],
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findOneForUser(id: string, user: AuthUser): Promise<Order> {
    const order = await this.findOne(id);

    const isOwner = order.buyerId === user.sub || order.merchantId === user.sub;
    const isAdmin = user.role === Role.ADMIN;

    if (!isOwner && !isAdmin) throw new ForbiddenException('Access denied');
    return order;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MERCHANT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Accepts a pending order on behalf of the merchant.
   *
   * ## New payment flow
   *
   * This method no longer calls `walletService.creditPending()`.  Instead:
   *
   * 1. Inside the transaction the order moves to {@link OrderStatus.AWAITING_PAYMENT}
   *    and product stock is decremented (reserved).
   * 2. After the transaction commits, `paymentsService.autoInitiateForOrder()`
   *    creates a Stripe Checkout Session and delivers the payment URL to the
   *    buyer by **email** and **in-app notification**.
   * 3. The Stripe `checkout.session.completed` webhook fires when the buyer pays.
   *    That webhook handler moves the order to `ACCEPTED`, sets `deliveryStatus:
   *    PREPARING`, reveals the buyer's phone, and calls `creditPending()` — all
   *    atomically in a single DB transaction.
   * 4. If the buyer does not pay within 24 h the `checkout.session.expired`
   *    webhook fires (and a belt-and-suspenders cron runs every 30 min).
   *    Both cancel the order and restore the reserved stock.
   *
   * @param orderId    - UUID of the order to accept.
   * @param merchantId - UUID of the authenticated merchant.
   */

  async acceptOrder(orderId: string, merchantId: string): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let cancelledOrders: Order[] = [];
    let buyerId: string;
    let buyerEmail: string;
    let productName: string;
    let finalPrice: number;
    let productId: string;
    let orderQuantity: number;
    let remainingQuantity: number = 0;

    try {
      // ── 1. Load and validate ───────────────────────────────────────────────
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        relations: ['buyer'],
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.merchantId !== merchantId)
        throw new ForbiddenException('Access denied');
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Order cannot be accepted in its current state',
        );
      }

      // ── 2. Lock and re-validate product quantity ───────────────────────────
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: order.productId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!product) throw new NotFoundException('Associated product not found');

      // Use availableQuantity if set, otherwise fall back to quantity
      const effectiveStock =
        product.availableQuantity != null
          ? Number(product.availableQuantity)
          : Number(product.quantity);

      if (effectiveStock < Number(order.quantity)) {
        throw new BadRequestException(
          `Insufficient stock: ${effectiveStock} unit(s) available but order requires ${order.quantity}`,
        );
      }

      // ── 3. Decrement product quantity ──────────────────────────────────────
      remainingQuantity = Number(product.quantity) - Number(order.quantity);
      const remainingAvailable =
        product.availableQuantity != null
          ? Number(product.availableQuantity) - Number(order.quantity)
          : remainingQuantity;

      await queryRunner.manager.update(Product, product.id, {
        quantity: remainingQuantity,
        availableQuantity: remainingAvailable,
        ...(remainingQuantity === 0 && { status: ProductStatus.SOLD }),
      });

      // ── 4. Move order to AWAITING_PAYMENT ─────────────────────────────────
      await queryRunner.manager.update(Order, orderId, {
        status: OrderStatus.AWAITING_PAYMENT,
      });

      // ── 5. Auto-cancel stale competing orders ──────────────────────────────
      cancelledOrders = await queryRunner.manager
        .createQueryBuilder(Order, 'o')
        .where('o.productId = :productId', { productId: order.productId })
        .andWhere('o.status = :status', { status: OrderStatus.PENDING })
        .andWhere('o.id != :orderId', { orderId })
        .andWhere('o.quantity > :remaining', { remaining: remainingAvailable })
        .getMany();

      if (cancelledOrders.length > 0) {
        await queryRunner.manager.update(
          Order,
          cancelledOrders.map((o) => o.id),
          {
            status: OrderStatus.CANCELLED,
            rejectionReason:
              'Order automatically cancelled: product quantity no longer available',
          },
        );
      }

      // Capture values needed after commit
      buyerId = order.buyerId;
      buyerEmail = order.buyer.email;
      productName = product.name;
      finalPrice = Number(order.finalPrice);
      productId = product.id;
      orderQuantity = Number(order.quantity);

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    // ── Post-commit: Stripe session ──────────────────────────────────────────
    //
    // If Stripe fails, manually revert everything back to pre-accept state
    // so the merchant can retry without any inconsistency.
    try {
      await this.paymentsService.autoInitiateForOrder(
        orderId,
        buyerId!,
        buyerEmail!,
        productName!,
        finalPrice!,
      );
    } catch (stripeError) {
      console.log(stripeError);
      // Revert order back to PENDING
      await this.dataSource.manager.update(Order, orderId, {
        status: OrderStatus.PENDING,
      });

      // Restore product quantity and availableQuantity
      await this.dataSource.manager.increment(
        Product,
        { id: productId! },
        'quantity',
        orderQuantity!,
      );
      await this.dataSource.manager.increment(
        Product,
        { id: productId! },
        'availableQuantity',
        orderQuantity!,
      );

      // If product was marked SOLD because quantity hit 0, revert that too
      if (remainingQuantity === 0) {
        await this.dataSource.manager.update(Product, productId!, {
          status: ProductStatus.ACTIVE,
        });
      }

      // Revert auto-cancelled competing orders back to PENDING
      if (cancelledOrders.length > 0) {
        await this.dataSource.manager.update(
          Order,
          cancelledOrders.map((o) => o.id),
          {
            status: OrderStatus.PENDING,
            rejectionReason: undefined,
          },
        );
      }

      throw new ServiceUnavailableException(
        'Payment service is currently unavailable. Please try accepting the order again.',
      );
    }

    // ── Post-commit: notifications ───────────────────────────────────────────
    //
    // Notification failures are non-critical — Stripe session already created
    // successfully so the buyer has a payment link via email regardless.

    await this.notificationsService.notify(merchantId, {
      type: NotificationType.ORDER_ACCEPTED,
      title: '',
      body: '',
      titleAr: 'تم قبول الطلب',
      bodyAr: 'تم قبول الطلب. في انتظار تأكيد الدفع من المشتري.',
      referenceType: 'order',
      referenceId: orderId,
    });

    for (const cancelled of cancelledOrders) {
      await this.notificationsService.notify(cancelled.buyerId, {
        type: NotificationType.ORDER_REJECTED,
        title: '',
        body: '',
        titleAr: 'تم إلغاء طلبك تلقائياً',
        bodyAr:
          'عذراً، تم إلغاء طلبك تلقائياً لعدم توفر الكمية المطلوبة بعد قبول طلب آخر.',
        referenceType: 'order',
        referenceId: cancelled.id,
      });
    }

    return this.findOne(orderId);
  }
  /**
   * Rejects a pending order on behalf of the merchant.
   */
  async rejectOrder(
    orderId: string,
    merchantId: string,
    reason?: string,
  ): Promise<Order> {
    const order = await this.findOne(orderId);

    if (order.merchantId !== merchantId)
      throw new ForbiddenException('Access denied');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order cannot be rejected in its current state',
      );
    }

    await this.repo.update(orderId, {
      status: OrderStatus.REJECTED,
      rejectionReason: reason,
    });

    await this.notificationsService.notify(order.buyerId, {
      type: NotificationType.ORDER_REJECTED,
      title: '',
      body: '',
      titleAr: 'تم رفض طلبك',
      bodyAr: reason ? `سبب الرفض: ${reason}` : 'تم رفض طلبك من قِبل البائع.',
      referenceType: 'order',
      referenceId: orderId,
    });

    return this.findOne(orderId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELIVERY STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Advances the delivery status of an accepted, paid order.
   *
   * Allowed transitions by delivery method:
   *
   * **FROM_FARM** (buyer collects):
   * ```
   * PREPARING → DELIVERED
   * ```
   *
   * **DRIVER** (merchant ships):
   * ```
   * PREPARING → IN_DELIVERY | READY_PICKUP
   * IN_DELIVERY → DELIVERED
   * READY_PICKUP → DELIVERED
   * ```
   *
   * Note: `order.status` must be `ACCEPTED` (set by the payment webhook).
   * Orders in `AWAITING_PAYMENT` are blocked here — the merchant cannot ship
   * before the buyer pays.
   */
  async updateDeliveryStatus(
    orderId: string,
    merchantId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(orderId);

    if (order.merchantId !== merchantId)
      throw new ForbiddenException('Access denied');

    if (order.status !== OrderStatus.ACCEPTED) {
      throw new BadRequestException(
        'Only accepted (paid) orders can have their delivery status updated',
      );
    }

    const currentStatus = order.deliveryStatus;
    const nextStatus = dto.status;

    if (!currentStatus)
      throw new BadRequestException('Order has no delivery status set');

    if (order.deliveryMethod === DeliveryMethod.FROM_FARM) {
      if (currentStatus === DeliveryStatus.DELIVERED) {
        throw new BadRequestException('Order has already been delivered');
      }
      const allowedTransitions: Partial<
        Record<DeliveryStatus, DeliveryStatus[]>
      > = {
        [DeliveryStatus.PREPARING]: [DeliveryStatus.DELIVERED],
      };
      if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        throw new BadRequestException(
          `Cannot transition delivery from "${currentStatus}" to "${nextStatus}"`,
        );
      }
    } else if (order.deliveryMethod === DeliveryMethod.DRIVER) {
      if (currentStatus === DeliveryStatus.DELIVERED) {
        throw new BadRequestException('Order has already been delivered');
      }
      const allowedTransitions: Partial<
        Record<DeliveryStatus, DeliveryStatus[]>
      > = {
        [DeliveryStatus.PREPARING]: [
          DeliveryStatus.IN_DELIVERY,
          DeliveryStatus.READY_PICKUP,
        ],
        [DeliveryStatus.IN_DELIVERY]: [DeliveryStatus.DELIVERED],
        [DeliveryStatus.READY_PICKUP]: [DeliveryStatus.DELIVERED],
      };
      if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        throw new BadRequestException(
          `Cannot transition delivery from "${currentStatus}" to "${nextStatus}"`,
        );
      }
    }

    await this.repo.update(orderId, { deliveryStatus: nextStatus });

    await this.notificationsService.notify(order.buyerId, {
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Delivery Status Updated',
      body: `Your order delivery status has changed to ${nextStatus}`,
      titleAr: 'تحديث حالة التوصيل',
      bodyAr: `حالة التوصيل تغيّرت إلى: ${nextStatus}`,
      referenceType: 'order',
      referenceId: orderId,
    });

    return this.findOne(orderId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUYER ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Confirms delivery receipt and marks the order as COMPLETED.
   *
   * Releases the merchant's pending wallet balance (funds held since payment
   * was confirmed) into their available balance.
   */
  async confirmCompleted(orderId: string, buyerId: string): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.buyerId !== buyerId)
        throw new ForbiddenException('Access denied');
      if (order.deliveryStatus !== DeliveryStatus.DELIVERED) {
        throw new BadRequestException('Order has not been delivered yet');
      }
      if (order.status === OrderStatus.COMPLETED) {
        throw new BadRequestException('Order is already completed');
      }

      await queryRunner.manager.update(Order, orderId, {
        status: OrderStatus.COMPLETED,
      });

      await this.walletService.releasePending(
        order.merchantId,
        Number(order.netAmount),
        order.id,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();

      await this.notificationsService.notify(order.merchantId, {
        type: NotificationType.ORDER_STATUS_CHANGED,
        title: '',
        body: '',
        titleAr: 'تم تأكيد استلام الطلب',
        bodyAr: 'أكد المشتري استلام الطلب وتم تحويل الأرباح إلى محفظتك.',
        referenceType: 'order',
        referenceId: order.id,
      });

      return this.findOne(orderId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cancels a PENDING order on behalf of the buyer.
   *
   * Orders in AWAITING_PAYMENT cannot be self-cancelled here — the buyer
   * should let the Stripe session expire (or contact support) since the
   * merchant has already committed their stock.
   */
  async cancelOrder(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.findOne(orderId);

    if (order.buyerId !== buyerId)
      throw new ForbiddenException('Access denied');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    await this.repo.update(orderId, { status: OrderStatus.CANCELLED });

    await this.notificationsService.notify(order.merchantId, {
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: '',
      body: '',
      titleAr: 'تم إلغاء الطلب',
      bodyAr: 'قام المشتري بإلغاء الطلب.',
      referenceType: 'order',
      referenceId: order.id,
    });

    return this.findOne(orderId);
  }
}
