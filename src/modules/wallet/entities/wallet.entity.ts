import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import {
  WalletTransactionReason,
  WalletTransactionType,
} from 'src/common/enums/wallet.enum';
import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { DecimalTransformer } from 'src/database/transformers/decimal.transformer';
import { BankAccount } from 'src/modules/bank-account/entities/bank-account.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', unique: true })
  merchantId: string;

  @Column({
    name: 'available_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  availableBalance: number = 0;
  @Column({
    name: 'pending_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  pendingBalance: number;

  @Column({
    name: 'total_earned',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  totalEarned: number;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User, (u) => u.wallet)
  @JoinColumn({ name: 'merchant_id' })
  merchant: User;

  @OneToMany(() => WalletTransaction, (t) => t.wallet)
  transactions: WalletTransaction[];
}

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ type: 'enum', enum: WalletTransactionType })
  type: WalletTransactionType;

  @Column({ type: 'enum', enum: WalletTransactionReason })
  reason: WalletTransactionReason;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: new DecimalTransformer(),
  })
  amount: number;

  @Column({
    name: 'balance_after',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: new DecimalTransformer(),
  })
  balanceAfter: number;

  @Column({ name: 'reference_type', nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', nullable: true })
  referenceId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'bank_account_id', nullable: true, type: 'uuid' })
  bankAccountId: string | null;

  @ManyToOne(() => Wallet, (w) => w.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;
}

@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ name: 'bank_account_id', nullable: true })
  bankAccountId: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: new DecimalTransformer(),
  })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
  })
  status: WithdrawalStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'merchant_id' })
  merchant: User;

  @ManyToOne(() => BankAccount, {
    nullable: true,
  })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;
}
