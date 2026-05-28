import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WithdrawalRequest } from '../../wallet/entities/wallet.entity';
import { WalletService } from '../../wallet/wallet.service';

import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WithdrawalFilters {
  status?: WithdrawalStatus;
  merchantId?: string;
  from?: string;
  to?: string;
}

export interface WithdrawalStats {
  total: number;
  pending: number;
  completed: number;
  rejected: number;
  totalAmountPending: number; // sum of amounts in PENDING state
  totalAmountCompleted: number; // total SAR transferred out all time
}

export interface ProcessPayload {
  adminId: string;
  action: 'complete' | 'reject';
  adminNotes: string;
  userEmail?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminWithdrawalsService {
  private readonly logger = new Logger(AdminWithdrawalsService.name);

  constructor(
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalsRepo: Repository<WithdrawalRequest>,
    private readonly walletService: WalletService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getWithdrawals(
    pagination: PaginationDto,
    filters: WithdrawalFilters = {},
  ) {
    const qb = this.withdrawalsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.merchant', 'merchant')
      .leftJoinAndSelect('w.bankAccount', 'bankAccount')
      .orderBy('w.createdAt', 'DESC');

    if (filters.status)
      qb.andWhere('w.status = :status', { status: filters.status });

    if (filters.merchantId)
      qb.andWhere('w.merchantId = :merchantId', {
        merchantId: filters.merchantId,
      });

    if (filters.from)
      qb.andWhere('w.createdAt >= :from', { from: filters.from });

    if (filters.to) qb.andWhere('w.createdAt <= :to', { to: filters.to });

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  /**
   * Pending queue sorted oldest-first — oldest requests are reviewed first.
   */
  async getPendingWithdrawals(pagination: PaginationDto) {
    const qb = this.withdrawalsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.merchant', 'merchant')
      //.leftJoinAndSelect('w.bankAccount', 'bankAccount')
      .where('w.status = :status', { status: WithdrawalStatus.PENDING })
      .orderBy('w.createdAt', 'ASC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getWithdrawal(id: string): Promise<WithdrawalRequest> {
    const withdrawal = await this.withdrawalsRepo.findOne({
      where: { id },
      relations: ['merchant', 'bankAccount'],
    });

    if (!withdrawal)
      throw new NotFoundException('Withdrawal request not found');

    return withdrawal;
  }

  async getStats(): Promise<WithdrawalStats> {
    const rows = await this.withdrawalsRepo
      .createQueryBuilder('w')
      .select('w.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(w.amount), 0)', 'totalAmount')
      .groupBy('w.status')
      .getRawMany<{
        status: WithdrawalStatus;
        count: string;
        totalAmount: string;
      }>();

    const stats: WithdrawalStats = {
      total: 0,
      pending: 0,
      completed: 0,
      rejected: 0,
      totalAmountPending: 0,
      totalAmountCompleted: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      const amount = parseFloat(row.totalAmount);
      stats.total += count;

      switch (row.status) {
        case WithdrawalStatus.PENDING:
          stats.pending = count;
          stats.totalAmountPending = amount;
          break;
        case WithdrawalStatus.COMPLETED:
          stats.completed = count;
          stats.totalAmountCompleted = amount;
          break;
        case WithdrawalStatus.REJECTED:
          stats.rejected = count;
          break;
      }
    }

    return stats;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Approves or rejects a withdrawal request.
   * All business logic (wallet debit, merchant notification) lives in
   * WalletService.processWithdrawal — this service only adds audit logging
   * and guards against double-processing a non-pending request.
   */
  async processWithdrawal(id: string, payload: ProcessPayload) {
    const withdrawal = await this.getWithdrawal(id);

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Withdrawal is already ${withdrawal.status} and cannot be processed again.`,
      );
    }

    const result = await this.walletService.processWithdrawal(
      id,
      payload.action,
      payload.adminNotes,
      payload.userEmail,
    );

    this.logger.log(
      `Withdrawal [id=${id}] ${payload.action}d by admin [${payload.adminId}]` +
        (payload.adminNotes ? ` — notes: ${payload.adminNotes}` : ''),
    );

    return result;
  }

  async rejectWithdrawl(id: string, payload: ProcessPayload) {
    const withdrawal = await this.getWithdrawal(id);

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Withdrawal is already ${withdrawal.status} and cannot be processed again.`,
      );
    }

    const result = await this.walletService.rejectWithdrawal(
      id,
      payload.adminNotes,
      payload.userEmail,
    );

    this.logger.log(
      `Withdrawal  [id=${id}] ${payload.action}d by admin [${payload.adminId}]` +
        (payload.adminNotes ? ` — notes: ${payload.adminNotes}` : ''),
    );

    return result;
  }
}
