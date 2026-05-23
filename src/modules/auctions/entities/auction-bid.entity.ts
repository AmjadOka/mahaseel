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

const decimalTransformer = {
  to: (v: number) => v,
  from: (v: string) => parseFloat(v),
};

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
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ type: 'enum', enum: BidStatus, default: BidStatus.ACTIVE })
  status: BidStatus;

  @Column({ name: 'is_winning', default: false })
  isWinning: boolean;

<<<<<<< HEAD
  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string;
=======
  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string | null;
>>>>>>> 668248664679d1294fd22e94ffd03177d03f73c1

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
