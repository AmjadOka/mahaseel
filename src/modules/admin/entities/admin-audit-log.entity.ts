import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Permanent record of every admin action.
 * Never deleted — append-only for compliance.
 *
 * Logger.warn() disappears on restart; this table survives forever.
 */
@Entity('admin_audit_logs')
@Index(['adminId'])
@Index(['resourceType', 'resourceId'])
@Index(['createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** UUID of the admin who performed the action */
  @Column({ type: 'uuid' })
  adminId: string;

  /** Phone or email — denormalised for readability in reports */
  @Column({ nullable: true })
  adminPhone: string;

  /**
   * Uppercase snake_case action name.
   * e.g. SUSPEND_USER | APPROVE_FARM | FORCE_CANCEL_ORDER | PROCESS_WITHDRAWAL
   */
  @Column()
  action: string;

  /** 'user' | 'farm' | 'order' | 'product' | 'withdrawal' | 'notification' */
  @Column()
  resourceType: string;

  /** UUID of the affected record */
  @Column({ type: 'uuid', nullable: true })
  resourceId: string;

  /** Human-readable reason / notes supplied by the admin */
  @Column({ type: 'text', nullable: true })
  reason: string;

  /**
   * Extra context — previous status, new status, payload snapshot, etc.
   * Stored as JSONB so it's queryable.
   */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
