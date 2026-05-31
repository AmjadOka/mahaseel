import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Check,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

// ─── Rating ──────────────────────────────────────────────────────────────────

@Entity('ratings')
@Check('"score" >= 1 AND "score" <= 5')
@Unique(['orderId', 'reviewerId'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ name: 'reviewer_id' })
  reviewerId: string;

  @Column({ name: 'reviewed_id' })
  reviewedId: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => User, (u) => u.givenRatings)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @ManyToOne(() => User, (u) => u.receivedRatings)
  @JoinColumn({ name: 'reviewed_id' })
  reviewed: User;

  @OneToMany(() => RatingFlag, (f) => f.rating)
  flags: RatingFlag[];
}

// ─── RatingFlag ───────────────────────────────────────────────────────────────
// Users can report abusive/false ratings for admin review.

export enum FlagReason {
  FAKE = 'fake',
  OFFENSIVE = 'offensive',
  IRRELEVANT = 'irrelevant',
  OTHER = 'other',
}

export enum FlagStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
  REMOVED = 'removed',
}

@Entity('rating_flags')
@Unique(['ratingId', 'reporterId']) // one flag per person per rating
export class RatingFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rating_id' })
  ratingId: string;

  @Column({ name: 'reporter_id' })
  reporterId: string;

  @Column({ type: 'enum', enum: FlagReason, default: FlagReason.OTHER })
  reason: FlagReason;

  @Column({ type: 'varchar', nullable: true, length: 400 })
  notes: string;

  @Column({ type: 'enum', enum: FlagStatus, default: FlagStatus.PENDING })
  status: FlagStatus;

  @Column({ name: 'admin_notes', type: 'varchar', nullable: true, length: 400 })
  adminNotes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Rating, (r) => r.flags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rating_id' })
  rating: Rating;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;
}
