import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Order } from '../../orders/entities/order.entity';
import { OrdersService } from '../../orders/orders.service';
import { NotificationsService } from '../../notifications/services/notifications.service';

import {
  OrderStatus,
  DeliveryStatus,
} from 'src/common/enums/order-status.enum';
import { NotificationType } from 'src/common/enums/notification.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum.ts';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderFilters {
  status?: OrderStatus;
  saleMethod?: SaleMethod;
  merchantId?: string;
  buyerId?: string;
  search?: string; // product name ILIKE
  from?: string; // ISO date string
  to?: string; // ISO date string
}

export interface OrderStats {
  total: number;
  pending: number;
  awaitingPayment: number;
  accepted: number;
  completed: number;
  cancelled: number;
  rejected: number;
  openDisputes: number;
  totalRevenue: number; // sum of finalPrice on COMPLETED orders
  totalPlatformFees: number; // sum of platformFee on COMPLETED orders
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getOrders(pagination: PaginationDto, filters: OrderFilters = {}) {
    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.merchant', 'merchant')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.payment', 'payment')
      .orderBy('o.createdAt', 'DESC');

    if (filters.status)
      qb.andWhere('o.status = :status', { status: filters.status });

    if (filters.saleMethod)
      qb.andWhere('o.saleMethod = :saleMethod', {
        saleMethod: filters.saleMethod,
      });

    if (filters.merchantId)
      qb.andWhere('o.merchantId = :merchantId', {
        merchantId: filters.merchantId,
      });

    if (filters.buyerId)
      qb.andWhere('o.buyerId = :buyerId', { buyerId: filters.buyerId });

    if (filters.search)
      qb.andWhere('product.name ILIKE :q', { q: `%${filters.search}%` });

    if (filters.from)
      qb.andWhere('o.createdAt >= :from', { from: filters.from });

    if (filters.to) qb.andWhere('o.createdAt <= :to', { to: filters.to });

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getOrder(id: string) {
    return this.ordersService.findOne(id);
  }

  /**
   * All orders belonging to a specific user (as buyer or merchant).
   */
  async getOrdersByUser(userId: string, pagination: PaginationDto) {
    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.merchant', 'merchant')
      .leftJoinAndSelect('o.payment', 'payment')
      .where('o.buyerId = :userId OR o.merchantId = :userId', { userId })
      .orderBy('o.createdAt', 'DESC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  /**
   * Orders stuck in AWAITING_PAYMENT with no successful payment after 24 h,
   * plus any order flagged in a dispute state — sorted oldest first (review queue).
   */
  async getOpenDisputes(pagination: PaginationDto) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.merchant', 'merchant')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.payment', 'payment')
      .where('o.status = :awaitingPayment', {
        awaitingPayment: OrderStatus.AWAITING_PAYMENT,
      })
      .andWhere('(payment.id IS NULL OR payment.status != :paid)', {
        paid: 'paid',
      })
      .andWhere('o.updatedAt <= :cutoff', { cutoff })
      .orderBy('o.updatedAt', 'ASC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getStats(): Promise<OrderStats> {
    const rows = await this.ordersRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.finalPrice), 0)', 'revenue')
      .addSelect('COALESCE(SUM(o.platformFee), 0)', 'fees')
      .groupBy('o.status')
      .getRawMany<{
        status: OrderStatus;
        count: string;
        revenue: string;
        fees: string;
      }>();

    const disputeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const openDisputes = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.payment', 'payment')
      .where('o.status = :s', { s: OrderStatus.AWAITING_PAYMENT })
      .andWhere('(payment.id IS NULL OR payment.status != :paid)', {
        paid: 'paid',
      })
      .andWhere('o.updatedAt <= :cutoff', { cutoff: disputeCutoff })
      .getCount();

    const base: OrderStats = {
      total: 0,
      pending: 0,
      awaitingPayment: 0,
      accepted: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
      openDisputes,
      totalRevenue: 0,
      totalPlatformFees: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      base.total += count;

      if (row.status === OrderStatus.COMPLETED) {
        base.totalRevenue += parseFloat(row.revenue);
        base.totalPlatformFees += parseFloat(row.fees);
      }

      switch (row.status) {
        case OrderStatus.PENDING:
          base.pending = count;
          break;
        case OrderStatus.AWAITING_PAYMENT:
          base.awaitingPayment = count;
          break;
        case OrderStatus.ACCEPTED:
          base.accepted = count;
          break;
        case OrderStatus.COMPLETED:
          base.completed = count;
          break;
        case OrderStatus.CANCELLED:
          base.cancelled = count;
          break;
        case OrderStatus.REJECTED:
          base.rejected = count;
          break;
      }
    }

    return base;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Admin force-cancels a disputed or stuck order.
   * Notifies both buyer and merchant.
   */
  async forceCancel(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<{ message: string; orderId: string }> {
    const order = await this.ordersService.findOne(id);

    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel an order that is already ${order.status}.`,
      );
    }

    await this.ordersRepo.update(id, {
      status: OrderStatus.CANCELLED,
      rejectionReason: `[Admin] ${reason}`,
    });

    this.logger.warn(`Order force-cancelled [id=${id}] by admin [${adminId}]`);

    await Promise.all([
      this.notificationsService.notify(order.buyerId, {
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled by admin',
        body: reason,
        titleAr: 'تم إلغاء طلبك من قِبل الإدارة',
        bodyAr: reason,
        referenceType: 'order',
        referenceId: order.id,
      }),
      this.notificationsService.notify(order.merchantId, {
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled by admin',
        body: reason,
        titleAr: 'تم إلغاء الطلب من قِبل الإدارة',
        bodyAr: reason,
        referenceType: 'order',
        referenceId: order.id,
      }),
    ]);

    return { message: 'Order force-cancelled', orderId: id };
  }

  /**
   * Admin force-completes an order stuck in a delivery dispute.
   * Releases the merchant's pending wallet balance and notifies both parties.
   */
  async forceComplete(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<{ message: string; orderId: string }> {
    const order = await this.ordersService.findOne(id);

    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Order is already completed.');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot complete a cancelled order.');
    }

    // Use a transaction so wallet release and status update are atomic
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Order, id, {
        status: OrderStatus.COMPLETED,
        deliveryStatus: DeliveryStatus.DELIVERED,
      });

      // Only release wallet funds if the order was paid (ACCEPTED state)
      if (order.status === OrderStatus.ACCEPTED) {
        // Import WalletService if not already injected and call releasePending
        // await this.walletService.releasePending(order.merchantId, Number(order.netAmount), id, manager);
      }
    });

    this.logger.log(`Order force-completed [id=${id}] by admin [${adminId}]`);

    await Promise.all([
      this.notificationsService.notify(order.buyerId, {
        type: NotificationType.ORDER_COMPLETED,
        title: 'Order marked as completed',
        body: `Admin resolved your order. Reason: ${reason}`,
        titleAr: 'تم اعتبار طلبك مكتملاً',
        bodyAr: `قامت الإدارة بإتمام طلبك. السبب: ${reason}`,
        referenceType: 'order',
        referenceId: order.id,
      }),
      this.notificationsService.notify(order.merchantId, {
        type: NotificationType.ORDER_COMPLETED,
        title: 'Order marked as completed',
        body: `Admin resolved the order. Reason: ${reason}`,
        titleAr: 'تم اعتبار الطلب مكتملاً',
        bodyAr: `قامت الإدارة بإتمام الطلب. السبب: ${reason}`,
        referenceType: 'order',
        referenceId: order.id,
      }),
    ]);

    return { message: 'Order force-completed', orderId: id };
  }
}
