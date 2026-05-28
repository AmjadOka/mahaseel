import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';

import { Exclude } from 'class-transformer';

import { Role } from 'src/common/enums/role.enum';

import { Farm } from '../../farms/entities/farm.entity';
import { Order } from '../../orders/entities/order.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { BankAccount } from 'src/modules/bank-account/entities/bank-account.entity';
import { PromotionStatus } from 'src/common/enums/promotionStatus';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /* =====================================================
      BASIC INFO
  ===================================================== */

  @Column({ type: 'enum', enum: Role, default: Role.BUYER })
  role: Role;

  @Column({ unique: true, length: 100 })
  email: string;

  @Column({ unique: true, length: 20, nullable: true, type: 'varchar' })
  phone: string | null;

  @Column({ name: 'full_name', length: 100, nullable: true, type: 'varchar' })
  fullName: string | null;

  @Column({ name: 'profile_image', nullable: true, type: 'varchar' })
  profileImage: string | null;

  @Column({ nullable: true, type: 'varchar' })
  avatarPublicId: string | null;

  /* =====================================================
      AUTH — LOCAL
  ===================================================== */

  @Column({ select: false, nullable: true, type: 'varchar' })
  @Exclude()
  password: string | null;

  @Column({
    name: 'refresh_token_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  @Exclude()
  refreshTokenHash: string | null;

  @Column({ default: 0 })
  tokenVersion: number;

  /* =====================================================
      AUTH — OAUTH
  ===================================================== */

  /**
   * Populated when the user signs in via Google OAuth.
   * Null for email/password-only accounts.
   */
  @Column({ name: 'google_id', nullable: true, unique: true, type: 'text' })
  googleId: string | null;

  /* =====================================================
      EMAIL VERIFICATION
  ===================================================== */

  /**
   * 6-digit code e-mailed on sign-up.
   * Cleared once the account is activated.
   */
  @Column({
    name: 'email_verification_code',
    type: 'varchar',
    length: 6,
    nullable: true,
    select: false,
  })
  @Exclude()
  emailVerificationCode: string | null;

  @Column({
    name: 'email_verification_expires',
    type: 'timestamp',
    nullable: true,
    select: false,
  })
  @Exclude()
  emailVerificationExpires: Date | null;

  /* =====================================================
      PASSWORD RESET
  ===================================================== */

  @Column({
    type: 'varchar',
    length: 6,
    name: 'reset_code',
    nullable: true,
    select: false,
  })
  @Exclude()
  resetCode: string | null;

  @Column({
    name: 'reset_expires',
    type: 'timestamp',
    nullable: true,
    select: false,
  })
  @Exclude()
  resetExpires: Date | null;

  @Column({ name: 'reset_attempts', default: 0, select: false })
  @Exclude()
  resetAttempts: number;

  @Column({ name: 'is_reset_verified', default: false, select: false })
  @Exclude()
  isResetVerified: boolean;

  /* =====================================================
      ACCOUNT STATUS
  ===================================================== */

  /**
   * false until the user verifies their email (or signs in via OAuth).
   */
  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'is_deleted', default: false, select: false })
  @Exclude()
  isDeleted: boolean;

  @Column({
    name: 'deleted_at',
    type: 'timestamp',
    nullable: true,
    select: false,
  })
  @Exclude()
  deletedAt: Date;

  /* =====================================================
      RATINGS
  ===================================================== */

  @Column({
    name: 'rating_avg',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
  })
  ratingAvg: number;

  @Column({ name: 'rating_count', default: 0 })
  ratingCount: number;

  /* =====================================================
      TIMESTAMPS
  ===================================================== */

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /* =====================================================
      PROMOTION STATUS
  ===================================================== */

  @Column({
    name: 'promotion_status',
    type: 'enum',
    enum: PromotionStatus,
    default: PromotionStatus.NONE,
  })
  promotionStatus: PromotionStatus;

  /* =====================================================
      RELATIONS
  ===================================================== */

  @OneToMany(() => Farm, (farm) => farm.owner)
  farms: Farm[];

  @OneToMany(() => Order, (order) => order.merchant)
  merchantOrders: Order[];

  @OneToMany(() => Order, (order) => order.buyer)
  buyerOrders: Order[];

  @OneToMany(() => Rating, (rating) => rating.reviewer)
  givenRatings: Rating[];

  @OneToMany(() => Rating, (rating) => rating.reviewed)
  receivedRatings: Rating[];

  @OneToOne(() => Wallet, (wallet) => wallet.merchant)
  wallet: Wallet;

  @OneToMany(() => Notification, (n) => n.user)
  notifications: Notification[];

  @OneToMany(() => BankAccount, (account) => account.user)
  bankAccounts: BankAccount[];
}
