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
  totalAmountPending: number; // sum of pending withdrawal amounts
  totalAmountCompleted: number; // total SAR transferred out all time
}

export interface ProcessPayload {
  adminId: string;
  action: 'complete' | 'reject';
  adminNotes?: string;
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
   * Pending queue sorted oldest-first — oldest requests reviewed first.
   */
  async getPendingWithdrawals(pagination: PaginationDto) {
    const qb = this.withdrawalsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.merchant', 'merchant')
      .leftJoinAndSelect('w.bankAccount', 'bankAccount')
      .where('w.status = :status', { status: WithdrawalStatus.PENDING })
      .orderBy('w.createdAt', 'ASC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getWithdrawal(id: string): Promise<WithdrawalRequest> {
    const w = await this.withdrawalsRepo.findOne({
      where: { id },
      relations: ['merchant', 'bankAccount'],
    });
    if (!w) throw new NotFoundException('Withdrawal request not found');
    return w;
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

    const base: WithdrawalStats = {
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
      base.total += count;

      switch (row.status) {
        case WithdrawalStatus.PENDING:
          base.pending = count;
          base.totalAmountPending = amount;
          break;
        case WithdrawalStatus.COMPLETED:
          base.completed = count;
          base.totalAmountCompleted = amount;
          break;
        case WithdrawalStatus.REJECTED:
          base.rejected = count;
          break;
      }
    }

    return base;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Approves or rejects a withdrawal request.
   * All business logic (wallet debit, merchant notification) lives in
   * WalletService.processWithdrawal — this service only adds audit logging
   * and guards the transition from a non-pending state.
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
    );

    this.logger.log(
      `Withdrawal [id=${id}] ${payload.action}d by admin [${payload.adminId}]` +
        (payload.adminNotes ? ` — notes: ${payload.adminNotes}` : ''),
    );

    return result;
  }
}
