import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr: string;

  @Column({ name: 'name_en', length: 100 })
  nameEn: string;

  @Column({ name: 'slug', type: 'varchar', unique: true, nullable: true })
  slug: string;

  @Column({ name: 'icon_url', type: 'varchar', nullable: true })
  iconUrl: string | null;

  /** Cloudinary public_id — required to replace or delete the icon asset */
  @Column({ name: 'icon_public_id', type: 'varchar', nullable: true })
  iconPublicId: string | null;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────

  @ManyToOne(() => Category, (cat) => cat.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @OneToMany(() => Category, (cat) => cat.parent)
  children: Category[];

  @OneToMany(() => Product, (p) => p.category)
  products: Product[];
}
