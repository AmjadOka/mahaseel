import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';

@Entity('bank_accounts')
@Index(['userId', 'isDefault'])
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* ── owner ─────────────────────────────────────────── */

  @ManyToOne(() => User, (user) => user.bankAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  /* ── bank details ───────────────────────────────────── */

  @Column({ length: 100 })
  bankName: string;

  @Column({ name: 'account_holder_name', length: 150 })
  accountHolderName: string;

  /** Account number or IBAN — stored as-is, validated in DTO */
  @Column({ name: 'account_number', length: 50 })
  accountNumber: string;

  /** Optional — some banks use IBAN on top of account number */
  @Column({ length: 34, nullable: true })
  iban: string;

  /** Free-text branch info, e.g. "Ramallah branch" */
  @Column({ length: 150, nullable: true })
  branchName: string;

  /* ── flags ──────────────────────────────────────────── */

  /** Only one account per user may be default at any time */
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /* ── timestamps ─────────────────────────────────────── */

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
