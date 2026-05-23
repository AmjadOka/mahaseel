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
import { Farm } from '../../farms/entities/farm.entity';
import { Category } from '../../categories/entities/category.entity';
import { Order } from '../../orders/entities/order.entity';
import { AuctionBid } from '../../auctions/entities/auction-bid.entity';
import { SaleMethod, Unit } from 'src/common/enums/Unit.enum.ts';
import { ProductStatus } from 'src/common/enums/product.enum';
import { DeliveryMethod } from 'src/common/enums/delivery.enum';
import { MediaType } from 'src/common/enums/platform.enum';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id' })
  farmId: string;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

  @Column({ name: 'merchant_id' })
  merchantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  availableQuantity?: number;

  @Column({ type: 'enum', enum: Unit, default: Unit.KG })
  unit: Unit;

  @Column({ name: 'sale_method', type: 'enum', enum: SaleMethod })
  saleMethod: SaleMethod;

  @Column({
    name: 'fixed_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fixedPrice: number;

  @Column({
    name: 'auction_start_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  auctionStartPrice: number;

  @Column({ name: 'auction_end_at', type: 'timestamp', nullable: true })
  auctionEndAt: Date;

  @Column({
    name: 'current_bid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  currentBid: number | null;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({
    name: 'delivery_method',
    type: 'enum',
    enum: DeliveryMethod,
    default: DeliveryMethod.FROM_FARM,
  })
  deliveryMethod: DeliveryMethod;

  @Column({ name: 'driver_name', nullable: true })
  driverName: string;

  @Column({ name: 'driver_phone', nullable: true })
  driverPhone: string;

  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date;

  @Column({
    name: 'auction_duration_hours',
    type: 'int',
    nullable: true,
  })
  auctionDurationHours: number | null;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Farm, (farm) => farm.products)
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @ManyToOne(() => Category, (cat) => cat.products, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => ProductMedia, (m) => m.product, { cascade: true })
  media: ProductMedia[];

  @OneToMany(() => Order, (o) => o.product)
  orders: Order[];

  @OneToMany(() => AuctionBid, (b) => b.product)
  bids: AuctionBid[];
}

@Entity('product_media')
export class ProductMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column()
  url: string;

  @Column({
    name: 'media_type',
    type: 'enum',
    enum: MediaType,
    default: MediaType.IMAGE,
  })
  mediaType: MediaType;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product, (p) => p.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
