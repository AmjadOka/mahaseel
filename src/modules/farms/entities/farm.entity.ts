import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { FarmStatus } from 'src/common/enums/farm.enum';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('farms')
export class Farm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'display_name', length: 150 })
  displayName: string;

  @Column({ name: 'manager_name', length: 100 })
  managerName: string;

  @Column({ name: 'contact_phone', length: 20 })
  contactPhone: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ name: 'location_text', nullable: true })
  locationText: string;

  @Column({ name: 'ag_registry_no', nullable: true })
  agRegistryNo: string;

  @Column({ name: 'ag_registry_url', nullable: true })
  agRegistryUrl: string;

  @Column({ type: 'enum', enum: FarmStatus, default: FarmStatus.PENDING })
  status: FarmStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true, default: null })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  approvedAt: Date | null;

  @ManyToOne(() => User, (user) => user.farms)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => Product, (product) => product.farm)
  products: Product[];
}
