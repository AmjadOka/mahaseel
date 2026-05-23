import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Platform } from '../../../common/enums/platform.enum';

@Entity('fcm_tokens')
@Index(['userId'])
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ unique: true, type: 'text' })
  token: string;

  @Column({ type: 'enum', enum: Platform })
  platform: Platform;

  /**
   * Soft-deactivate instead of deleting so the row stays
   * for audit and we avoid re-inserting the same token later.
   */

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.fcmTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
