import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from '../../payments/entities/payment.entity';
import { PaymentStatus } from 'src/common/enums/payment.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyRevenueRow {
  date: string;
  revenue: number;
  platformFee: number;
  orderCount: number;
}

export interface MonthlyRevenueRow {
  month: string; // 'YYYY-MM'
  revenue: number;
  platformFee: number;
  orderCount: number;
}

export interface TopMerchantRow {
  merchantId: string;
  phone: string;
  orderCount: number;
  totalRevenue: number;
  platformFees: number;
}

export interface RevenueBreakdown {
  fixed: number;
  auction: number;
  total: number;
}

export interface ReportFilters {
  from?: string; // ISO date string e.g. '2025-01-01'
  to?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  // ── Daily Revenue ──────────────────────────────────────────────────────────

  /**
   * Revenue grouped by calendar day.
   */
  async getDailyRevenue(
    filters: ReportFilters = {},
  ): Promise<DailyRevenueRow[]> {
    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .select('DATE(p.paid_at)', 'date')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
      .addSelect('COALESCE(SUM(o.platform_fee), 0)', 'platformFee')
      .addSelect('COUNT(p.id)', 'orderCount')
      .leftJoin('orders', 'o', 'o.id = p.order_id')
      .where('p.status = :status', { status: PaymentStatus.PAID });

    this.applyDateFilters(qb, filters, 'p.paid_at');

    const rows = await qb
      .groupBy('DATE(p.paid_at)')
      .orderBy('date', 'DESC')
      .getRawMany<{
        date: string;
        revenue: string;
        platformFee: string;
        orderCount: string;
      }>();

    return rows.map((r) => ({
      date: r.date,
      revenue: parseFloat(r.revenue),
      platformFee: parseFloat(r.platformFee),
      orderCount: parseInt(r.orderCount, 10),
    }));
  }

  // ── Monthly Summary ────────────────────────────────────────────────────────

  /**
   * Revenue grouped by month for a given year (defaults to current year).
   * Returns all 12 months — zero-fills gaps so charts are always complete.
   */
  async getMonthlySummary(year?: number): Promise<MonthlyRevenueRow[]> {
    const targetYear = year ?? new Date().getFullYear();

    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .select("TO_CHAR(p.paid_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
      .addSelect('COALESCE(SUM(o.platform_fee), 0)', 'platformFee')
      .addSelect('COUNT(p.id)', 'orderCount')
      .leftJoin('orders', 'o', 'o.id = p.order_id')
      .where('p.status = :status', { status: PaymentStatus.PAID })
      .andWhere('EXTRACT(YEAR FROM p.paid_at) = :year', { year: targetYear })
      .groupBy("TO_CHAR(p.paid_at, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany<{
        month: string;
        revenue: string;
        platformFee: string;
        orderCount: string;
      }>();

    const monthMap = new Map(rows.map((r) => [r.month, r]));
    const result: MonthlyRevenueRow[] = [];

    for (let m = 1; m <= 12; m++) {
      const key = `${targetYear}-${String(m).padStart(2, '0')}`;
      const row = monthMap.get(key);
      result.push({
        month: key,
        revenue: row ? parseFloat(row.revenue) : 0,
        platformFee: row ? parseFloat(row.platformFee) : 0,
        orderCount: row ? parseInt(row.orderCount, 10) : 0,
      });
    }

    return result;
  }

  // ── Top Merchants ──────────────────────────────────────────────────────────

  /**
   * Top N merchants ranked by total revenue.
   */
  async getTopMerchants(
    filters: ReportFilters = {},
    limit = 10,
  ): Promise<TopMerchantRow[]> {
    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .select('o.merchant_id', 'merchantId')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(p.id)', 'orderCount')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(o.platform_fee), 0)', 'platformFees')
      .leftJoin('orders', 'o', 'o.id = p.order_id')
      .leftJoin('users', 'u', 'u.id = o.merchant_id')
      .where('p.status = :status', { status: PaymentStatus.PAID });

    this.applyDateFilters(qb, filters, 'p.paid_at');

    const rows = await qb
      .groupBy('o.merchant_id')
      .addGroupBy('u.phone')
      .orderBy('SUM(p.amount)', 'DESC')
      .limit(limit)
      .getRawMany<{
        merchantId: string;
        phone: string;
        orderCount: string;
        totalRevenue: string;
        platformFees: string;
      }>();

    return rows.map((r) => ({
      merchantId: r.merchantId,
      phone: r.phone,
      orderCount: parseInt(r.orderCount, 10),
      totalRevenue: parseFloat(r.totalRevenue),
      platformFees: parseFloat(r.platformFees),
    }));
  }

  // ── Revenue Breakdown by Sale Method ──────────────────────────────────────

  async getRevenueBreakdown(
    filters: ReportFilters = {},
  ): Promise<RevenueBreakdown> {
    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .select('o.sale_method', 'saleMethod')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
      .leftJoin('orders', 'o', 'o.id = p.order_id')
      .where('p.status = :status', { status: PaymentStatus.PAID });

    this.applyDateFilters(qb, filters, 'p.paid_at');

    const rows = await qb
      .groupBy('o.sale_method')
      .getRawMany<{ saleMethod: SaleMethod; revenue: string }>();

    const breakdown: RevenueBreakdown = { fixed: 0, auction: 0, total: 0 };

    for (const row of rows) {
      const amount = parseFloat(row.revenue);
      breakdown.total += amount;
      if (row.saleMethod === SaleMethod.FIXED) breakdown.fixed = amount;
      if (row.saleMethod === SaleMethod.AUCTION) breakdown.auction = amount;
    }

    return breakdown;
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private applyDateFilters(
    qb: ReturnType<typeof this.paymentsRepo.createQueryBuilder>,
    filters: ReportFilters,
    column: string,
  ) {
    if (filters.from) qb.andWhere(`${column} >= :from`, { from: filters.from });
    if (filters.to) qb.andWhere(`${column} <= :to`, { to: filters.to });
  }
}
