import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BidStatus } from 'src/common/enums/bid.enum';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { DecimalTransformer } from 'src/database/transformers/decimal.transformer';

@Entity('auction_bids')
export class AuctionBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'buyer_id' })
  buyerId: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: new DecimalTransformer(),
  })
  amount: number;

  @Column({ type: 'enum', enum: BidStatus, default: BidStatus.ACTIVE })
  status: BidStatus;

  @Column({ name: 'is_winning', default: false })
  isWinning: boolean;

  @Column({
    name: 'ip_address',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────

  @ManyToOne(() => Product, (p) => p.bids)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;
}
