import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import {
  NotificationPriority,
  NotificationType,
} from '../../../common/enums/notification.enum';

@Entity('notifications')
@Index(['userId', 'isRead'])
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  // ── English content ───────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  // ── Arabic content (nullable — not all notifications have translations) ───
  @Column({ name: 'title_ar', type: 'varchar', length: 255, nullable: true })
  titleAr?: string;

  @Column({ name: 'body_ar', type: 'text', nullable: true })
  bodyAr?: string;

  // ── Reference ─────────────────────────────────────────────────────────────
  /** e.g. 'order' | 'auction' | 'withdrawal' — pair with referenceId */
  @Column({ nullable: true, type: 'varchar', length: 100 })
  referenceType?: string;

  @Column({ nullable: true, type: 'uuid' })
  referenceId?: string;

  /** Extra JSON payload (auctionId, amount, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, any>;

  // ── Meta ──────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ default: false })
  pushEnabled: boolean;

  @Column({ default: false })
  emailed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (u) => u.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
