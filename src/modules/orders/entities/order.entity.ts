import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { SaleMethod, Unit } from '../../../common/enums/Unit.enum.js';
import {
  DeliveryStatus,
  OrderStatus,
} from 'src/common/enums/order-status.enum';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { DeliveryMethod } from '../../../common/enums/delivery.enum';
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ name: 'buyer_id' })
  buyerId: string;

  @Column({ name: 'sale_method', type: 'enum', enum: SaleMethod })
  saleMethod: SaleMethod;

  @Column({ name: 'offered_price', type: 'decimal', precision: 12, scale: 2 })
  offeredPrice: number;

  @Column({
    name: 'final_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  finalPrice: number;

  @Column({
    name: 'platform_fee',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  platformFee: number;

  @Column({
    name: 'net_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  netAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity: number;

  @Column({ type: 'enum', enum: Unit })
  unit: Unit;

  @Column({ name: 'delivery_method', type: 'enum', enum: DeliveryMethod })
  deliveryMethod: DeliveryMethod;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: DeliveryStatus,
    nullable: true,
  })
  deliveryStatus?: DeliveryStatus | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'buyer_phone_revealed', default: false })
  buyerPhoneRevealed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Product, (p) => p.orders)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => User, (u) => u.merchantOrders)
  @JoinColumn({ name: 'merchant_id' })
  merchant: User;

  @ManyToOne(() => User, (u) => u.buyerOrders)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @OneToOne(() => Payment, (p) => p.order)
  payment: Payment;

  @OneToOne(() => Rating, (r) => r.order)
  rating: Rating;
}
