import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';

import { Farm } from '../../farms/entities/farm.entity';
import { WithdrawalRequest } from '../../wallet/entities/wallet.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Product } from '../../products/entities/product.entity';

import { FarmStatus } from 'src/common/enums/farm.enum';
import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { PaymentStatus } from 'src/common/enums/payment.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum';
import { ProductStatus } from 'src/common/enums/product.enum';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Farm) private farmsRepo: Repository<Farm>,
    @InjectRepository(WithdrawalRequest)
    private withdrawalsRepo: Repository<WithdrawalRequest>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Order) private ordersRepo: Repository<Order>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Product) private productsRepo: Repository<Product>,
  ) {}

  async getDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      pendingFarms,
      pendingWithdrawals,
      activeAuctions,
      newUsersToday,
      todayOrderCount,
      openDisputesCount,
      todayRevenue,
      totalRevenue,
    ] = await Promise.all([
      this.farmsRepo.count({ where: { status: FarmStatus.PENDING } }),

      this.withdrawalsRepo.count({
        where: { status: WithdrawalStatus.PENDING },
      }),

      this.productsRepo.count({
        where: {
          saleMethod: SaleMethod.AUCTION,
          status: ProductStatus.ACTIVE,
        },
      }),

      this.usersRepo.count({
        where: { createdAt: MoreThan(todayStart) },
      }),

      this.ordersRepo.count({
        where: { createdAt: MoreThan(todayStart) },
      }),

      this.ordersRepo
        .createQueryBuilder('o')
        .leftJoin('payments', 'p', 'p.order_id = o.id AND p.status = :paid', {
          paid: PaymentStatus.PAID,
        })
        .where('o.status = :status', { status: OrderStatus.AWAITING_PAYMENT })
        .andWhere('p.id IS NULL')
        .andWhere('o.updated_at <= :cutoff', {
          cutoff: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        .getCount(),

      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.status = :status', { status: PaymentStatus.PAID })
        .andWhere('p.paid_at >= :start', { start: todayStart })
        .getRawOne<{ total: string }>(),

      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .addSelect('COALESCE(SUM(o.platform_fee), 0)', 'platformFees')
        .leftJoin('orders', 'o', 'o.id = p.order_id')
        .where('p.status = :status', { status: PaymentStatus.PAID })
        .getRawOne<{ total: string; platformFees: string }>(),
    ]);

    return {
      farms: {
        pendingApproval: pendingFarms,
      },
      withdrawals: {
        pendingProcessing: pendingWithdrawals,
      },
      auctions: {
        active: activeAuctions,
      },
      users: {
        newToday: newUsersToday,
      },
      orders: {
        today: todayOrderCount,
        openDisputes: openDisputesCount,
      },
      revenue: {
        today: Number(todayRevenue?.total ?? 0),
        allTime: Number(totalRevenue?.total ?? 0),
        allTimePlatformFees: Number(totalRevenue?.platformFees ?? 0),
      },
    };
  }
}
