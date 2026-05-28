import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DataSource, EntityManager } from 'typeorm';

import {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
} from './entities/wallet.entity';

import { WithdrawDto } from './dto/Withdraw.dto';

import { NotificationsService } from '../notifications/services/notifications.service';

import { paginate } from '../../shared/pagination/pagination.helper';

import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  WalletTransactionReason,
  WalletTransactionType,
} from 'src/common/enums/wallet.enum';
import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { BankAccount } from '../bank-account/entities/bank-account.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletsRepo: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,

    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalsRepo: Repository<WithdrawalRequest>,

    @InjectRepository(BankAccount)
    private readonly bankAccountsRepo: Repository<BankAccount>,

    private readonly dataSource: DataSource,

    private readonly notificationsService: NotificationsService,
  ) {}

  async getOrCreate(merchantId: string): Promise<Wallet> {
    let wallet = await this.walletsRepo.findOne({ where: { merchantId } });

    if (!wallet) {
      wallet = this.walletsRepo.create({ merchantId });
      wallet = await this.walletsRepo.save(wallet);
    }

    return wallet;
  }

  async getWallet(merchantId: string): Promise<Wallet> {
    return this.getOrCreate(merchantId);
  }

  async getTransactions(merchantId: string, pagination: PaginationDto) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.merchantId = :merchantId', { merchantId })
      .orderBy('tx.createdAt', 'DESC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async creditPending(
    merchantId: string,
    amount: number,
    orderId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.dataSource.manager;

    let wallet = await em.findOne(Wallet, {
      where: { merchantId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      wallet = em.create(Wallet, { merchantId });
      wallet = await em.save(wallet);
    }

    wallet.pendingBalance = Number(wallet.pendingBalance) + amount;
    wallet.totalEarned = Number(wallet.totalEarned) + amount;

    await em.save(wallet);

    await em.save(WalletTransaction, {
      walletId: wallet.id,
      merchantId,
      type: WalletTransactionType.CREDIT,
      reason: WalletTransactionReason.ORDER_EARNING,
      amount,
      balanceAfter: Number(wallet.pendingBalance),
      referenceType: 'order',
      referenceId: orderId,
      notes: 'Pending hold',
    });
  }

  async releasePending(
    merchantId: string,
    amount: number,
    orderId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.dataSource.manager;

    const wallet = await em.findOne(Wallet, {
      where: { merchantId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (Number(wallet.pendingBalance) < amount) {
      throw new BadRequestException('Insufficient pending balance');
    }

    wallet.pendingBalance = Number(wallet.pendingBalance) - amount;
    wallet.availableBalance = Number(wallet.availableBalance) + amount;

    await em.save(wallet);

    await em.save(WalletTransaction, {
      walletId: wallet.id,
      merchantId,
      type: WalletTransactionType.CREDIT,
      reason: WalletTransactionReason.BALANCE_RELEASE,
      amount,
      balanceAfter: wallet.availableBalance,
      referenceType: 'order',
      referenceId: orderId,
      notes: 'Released',
    });

    // No notification here — the caller (confirmCompleted in OrdersService)
    // is responsible for notifying the merchant. Keeping this method focused
    // on the financial operation prevents the wrong notification from firing
    // (previously this called notifyWithdrawalRequested which is only for
    // explicit withdrawal requests, not order earnings).
  }

  async requestWithdrawal(
    merchantId: string,
    dto: WithdrawDto,
  ): Promise<WithdrawalRequest> {
    // ── 1. Validate bank account BEFORE opening a transaction ──────────────
    const bankAccount = await this.bankAccountsRepo.findOne({
      where: {
        id: dto.bankAccountId,
        userId: merchantId,
        isActive: true,
      },
    });

    if (!bankAccount) {
      throw new NotFoundException(
        'Bank account not found or does not belong to this merchant',
      );
    }

    // ── 2. Financial updates inside a serialisable transaction ─────────────
    let savedWithdrawal!: WithdrawalRequest;

    await this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, {
        where: { merchantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.availableBalance) < dto.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      wallet.availableBalance = Number(wallet.availableBalance) - dto.amount;
      await manager.save(wallet);

      const withdrawal = manager.create(WithdrawalRequest, {
        merchantId,
        amount: dto.amount,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        status: WithdrawalStatus.PENDING,
      });

      savedWithdrawal = await manager.save(withdrawal);

      // Record the debit and link it to the chosen bank account
      await manager.save(WalletTransaction, {
        walletId: wallet.id,
        merchantId,
        type: WalletTransactionType.DEBIT,
        reason: WalletTransactionReason.WITHDRAWAL_REQUESTED,
        amount: dto.amount,
        balanceAfter: wallet.availableBalance,
        referenceType: 'withdrawal',
        referenceId: savedWithdrawal.id,
        bankAccountId: dto.bankAccountId,
        notes: `Withdrawal to ${bankAccount.bankName} ****${bankAccount.accountNumber.slice(-4)}`,
      });
    });

    // ── 3. Notification outside the transaction (failure must not roll back) ─
    await this.notificationsService.notifyWithdrawalRequested({
      userId: merchantId,
      amount: dto.amount,
      withdrawalId: savedWithdrawal.id,
    });

    return savedWithdrawal;
  }
  async getWithdrawals(merchantId: string): Promise<WithdrawalRequest[]> {
    return this.withdrawalsRepo.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }

  async processWithdrawal(
    requestId: string,
    action?: 'complete' | 'reject',
    notes?: string,
    userEmail?: string,
  ): Promise<void> {
    let completedRequest!: WithdrawalRequest;

    if (action === 'reject') {
      throw new BadRequestException('Use rejectWithdrawal()');
    }

    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(WithdrawalRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Withdrawal request not found');
      }

      if (request.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      request.status = WithdrawalStatus.COMPLETED;
      request.processedAt = new Date();
      request.notes = notes ?? '';

      completedRequest = await manager.save(request);
    });

    await this.notificationsService.notifyWithdrawalCompleted({
      userId: completedRequest.merchantId,
      amount: completedRequest.amount,
      withdrawalId: completedRequest.id,
      userEmail,
    });
  }

  async rejectWithdrawal(
    requestId: string,
    reason: string,
    userEmail?: string,
  ): Promise<void> {
    let rejectedRequest!: WithdrawalRequest;

    // Financial updates are isolated in the transaction.
    // The notification is intentionally outside — if the notification
    // provider throws, it must NOT roll back the refund.
    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(WithdrawalRequest, {
        where: { id: requestId },
      });

      if (!request) {
        throw new NotFoundException('Withdrawal request not found');
      }

      if (request.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      const wallet = await manager.findOne(Wallet, {
        where: { merchantId: request.merchantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Refund to available balance
      wallet.availableBalance =
        Number(wallet.availableBalance) + Number(request.amount);

      await manager.save(wallet);

      // Update withdrawal status
      request.status = WithdrawalStatus.REJECTED;
      request.rejectionReason = reason;
      request.processedAt = new Date();

      rejectedRequest = await manager.save(request);

      await manager.save(WalletTransaction, {
        walletId: wallet.id,
        merchantId: request.merchantId,
        type: WalletTransactionType.CREDIT,
        reason: WalletTransactionReason.WITHDRAWAL_REJECTED,
        amount: request.amount,
        balanceAfter: wallet.availableBalance,
        referenceType: 'withdrawal',
        referenceId: request.id,
        notes: reason,
      });
    });

    // Outside the transaction — a notification failure must not undo the refund
    await this.notificationsService.notifyWithdrawalRejected({
      userId: rejectedRequest.merchantId,
      amount: rejectedRequest.amount,
      withdrawalId: rejectedRequest.id,
      reason,
      userEmail: userEmail ?? '',
    });
  }
}
