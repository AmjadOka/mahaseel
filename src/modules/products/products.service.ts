import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product, ProductMedia } from './entities/product.entity';

import {
  CreateProductDto,
  UpdateProductDto,
  FilterMarketDto,
} from './dto/create-product.dto';

import { FarmsService } from '../farms/farms.service';
import { FarmStatus } from 'src/common/enums/farm.enum';

import { ProductStatus } from 'src/common/enums/product.enum';

import { SaleMethod } from 'src/common/enums/Unit.enum';

import { MediaType } from 'src/common/enums/platform.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { paginate } from 'src/shared/pagination/pagination.helper';
import { UploadService } from '../upload/upload.service';
import { RedisService } from 'src/shared/redis/redis.service';
export interface ProductFilters {
  status?: ProductStatus;
  saleMethod?: SaleMethod;
  merchantId?: string;
  farmId?: string;
  categoryId?: string;
  search?: string; // ILIKE on name / description
}

export interface ProductStats {
  total: number;
  active: number;
  sold: number;
  expired: number;
  inactive: number;
  fixedPrice: number;
  auction: number;
  liveAuctions: number; // ACTIVE + AUCTION + auctionEndAt > now
}

// ── Cache constants ───────────────────────────────────────────────────────────

const TTL = {
  publicProduct: 60 * 10, // 10 min — public detail page
  merchantList: 60 * 5, // 5 min  — merchant's own product list
  marketSearch: 60 * 2, // 2 min  — search results (short; filter space is unbounded)
  stats: 60 * 1, // 1 min  — admin stat block
} as const;

const CK = {
  public: (id: string) => `products:public:${id}`,
  merchant: (merchantId: string) => `products:merchant:${merchantId}`,
  market: (filter: FilterMarketDto) => {
    // Stable hash: sort keys so query-param order never creates duplicate entries
    const sorted = Object.fromEntries(
      Object.entries(filter).sort(([a], [b]) => a.localeCompare(b)),
    );
    return `products:market:${JSON.stringify(sorted)}`;
  },
  stats: () => 'products:stats',
} as const;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    @InjectRepository(ProductMedia)
    private readonly mediaRepo: Repository<ProductMedia>,

    private readonly uploadService: UploadService,
    private readonly farmsService: FarmsService,
    private readonly redis: RedisService,
  ) {}

  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  private async validateOwnership(
    productId: string,
    merchantId: string,
  ): Promise<Product> {
    const product = await this.findMerchantProduct(productId, merchantId);

    if (product.merchantId !== merchantId) {
      throw new ForbiddenException('Access denied');
    }

    return product;
  }

  /*
  |--------------------------------------------------------------------------
  | Create Product
  |--------------------------------------------------------------------------
  */

  async create(merchantId: string, dto: CreateProductDto): Promise<Product> {
    const farm = await this.farmsService.findOne(dto.farmId, merchantId);

    if (farm.status !== FarmStatus.APPROVED) {
      throw new BadRequestException(
        'Farm must be approved before listing products',
      );
    }

    const productData: Partial<Product> = {
      merchantId,
      farmId: dto.farmId,
      categoryId: dto.categoryId,

      name: dto.name,
      description: dto.description,

      quantity: dto.quantity,
      unit: dto.unit,

      saleMethod: dto.saleMethod,

      status: ProductStatus.ACTIVE,
    };

    /*
    |--------------------------------------------------------------------------
    | Fixed Price Product
    |--------------------------------------------------------------------------
    */

    if (dto.saleMethod === SaleMethod.FIXED) {
      productData.fixedPrice = dto.fixedPrice ?? undefined;
    }

    /*
    |--------------------------------------------------------------------------
    | Auction Product
    |--------------------------------------------------------------------------
    */

    if (dto.saleMethod === SaleMethod.AUCTION) {
      if (!dto.auctionStartPrice) {
        throw new BadRequestException('Auction start price is required');
      }

      productData.auctionStartPrice = dto.auctionStartPrice;

      productData.auctionDurationHours = dto.auctionDurationHours ?? 24;

      productData.auctionEndAt = new Date(
        Date.now() + productData.auctionDurationHours * 60 * 60 * 1000,
      );
    }

    const product = this.repo.create(productData);

    const saved = await this.repo.save(product);

    // A new product changes the merchant list and global stats
    await Promise.all([
      this.redis.del(CK.merchant(merchantId)),
      this.redis.del(CK.stats()),
    ]);

    return saved;
  }

  /*
  |--------------------------------------------------------------------------
  | Find Merchant Products
  |--------------------------------------------------------------------------
  */

  async findMyProducts(
    merchantId: string,
    status?: ProductStatus,
  ): Promise<Product[]> {
    const cacheKey = CK.merchant(merchantId);
    if (!status) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Product[];
    }

    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.media', 'media')
      .leftJoinAndSelect('p.category', 'category')
      .where('p.merchantId = :merchantId', {
        merchantId,
      })
      .andWhere('p.isDeleted = false')
      .orderBy('p.createdAt', 'DESC');

    if (status) {
      qb.andWhere('p.status = :status', { status });
    }

    const products = await qb.getMany();

    if (!status) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(products),
        TTL.merchantList,
      );
    }

    return qb.getMany();
  }

  /*
|--------------------------------------------------------------------------
| Merchant Product View
|--------------------------------------------------------------------------
*/

  async findMerchantProduct(id: string, merchantId: string): Promise<Product> {
    const product = await this.repo.findOne({
      where: {
        id,
        merchantId,
        isDeleted: false,
      },
      relations: ['media', 'category', 'farm', 'farm.owner'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  /*
|--------------------------------------------------------------------------
| Public Product View
|--------------------------------------------------------------------------
*/

  async findPublicProduct(id: string): Promise<Product> {
    const cached = await this.redis.get(CK.public(id));
    if (cached) return JSON.parse(cached) as Product;

    const product = await this.repo.findOne({
      where: {
        id,
        status: ProductStatus.ACTIVE,
        isDeleted: false,
      },
      relations: ['media', 'category', 'farm'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    await this.redis.set(
      CK.public(id),
      JSON.stringify(product),
      TTL.publicProduct,
    );
    return product;
  }

  /*
  |--------------------------------------------------------------------------
  | Update
  |--------------------------------------------------------------------------
  */

  async update(
    id: string,
    merchantId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.validateOwnership(id, merchantId);

    if (product.status === ProductStatus.SOLD) {
      throw new BadRequestException('Cannot edit a sold product');
    }

    Object.assign(product, dto);

    const saved = await this.repo.save(product);

    await this.bustProduct(id, merchantId);
    return saved;
  }

  /*
  |--------------------------------------------------------------------------
  | Soft Delete
  |--------------------------------------------------------------------------
  */

  async softDelete(id: string, merchantId: string): Promise<void> {
    await this.validateOwnership(id, merchantId);

    await this.repo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    await Promise.all([
      this.bustProduct(id, merchantId),
      this.redis.del(CK.stats()),
    ]);
  }

  /*
  |--------------------------------------------------------------------------
  | Upload Media
  |--------------------------------------------------------------------------
  */

  // ── Add to ProductsService constructor ────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────

  async uploadMedia(
    productId: string,
    merchantId: string,
    files: Express.Multer.File[],
  ): Promise<ProductMedia[]> {
    await this.validateOwnership(productId, merchantId);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    // Upload all files to Cloudinary concurrently
    const uploaded = await Promise.all(
      files.map((file) => this.uploadService.upload(file, 'product')),
    );

    const mediaEntities = uploaded.map((asset, index) =>
      this.mediaRepo.create({
        productId,
        url: asset.url,
        publicId: asset.publicId,
        mediaType: files[index].mimetype.startsWith('video/')
          ? MediaType.VIDEO
          : MediaType.IMAGE,
        sortOrder: index,
      }),
    );

    const saved = await this.mediaRepo.save(mediaEntities);

    await this.bustProduct(productId, merchantId);
    return saved;
  }

  /**
   * Deletes a media row from the DB and its asset from Cloudinary.
   * Cloudinary deletion is fire-and-forget — a failed CDN delete
   * never blocks the DB row removal.
   */
  async deleteMedia(
    productId: string,
    mediaId: string,
    merchantId: string,
  ): Promise<void> {
    await this.validateOwnership(productId, merchantId);

    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Delete from Cloudinary first (non-blocking on failure)
    if (media.publicId) {
      await this.uploadService.delete(media.publicId);
    }

    await this.mediaRepo.delete(mediaId);
    await this.bustProduct(productId, merchantId);
  }
  /*
  |--------------------------------------------------------------------------
  | Market Search
  |--------------------------------------------------------------------------
  */

  async searchMarket(filter: FilterMarketDto) {
    const cacheKey = CK.market(filter);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const {
      q,
      categoryId,
      saleMethod,
      priceMin,
      priceMax,
      location,
      unit,
      page = 1,
      limit = 20,
    } = filter;

    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.media', 'media')
      .leftJoinAndSelect('p.category', 'category')
      .innerJoin('p.farm', 'farm')
      .where('p.status = :status', {
        status: ProductStatus.ACTIVE,
      })
      .andWhere('p.isDeleted = false');

    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    */

    if (q) {
      qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q)', {
        q: `%${q}%`,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Filters
    |--------------------------------------------------------------------------
    */

    if (categoryId) {
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId,
      });
    }

    if (saleMethod) {
      qb.andWhere('p.saleMethod = :saleMethod', {
        saleMethod,
      });
    }

    if (unit) {
      qb.andWhere('p.unit = :unit', {
        unit,
      });
    }

    if (priceMin !== undefined) {
      qb.andWhere('COALESCE(p.fixedPrice, p.auctionStartPrice) >= :priceMin', {
        priceMin,
      });
    }

    if (priceMax !== undefined) {
      qb.andWhere('COALESCE(p.fixedPrice, p.auctionStartPrice) <= :priceMax', {
        priceMax,
      });
    }

    if (location) {
      qb.andWhere('farm.locationText ILIKE :location', {
        location: `%${location}%`,
      });
    }

    qb.orderBy('p.createdAt', 'DESC');

    const result = await paginate(qb, page, limit);
    await this.redis.set(cacheKey, JSON.stringify(result), TTL.marketSearch);
    return result;
  }

  /*
  |--------------------------------------------------------------------------
  | Relist Product
  |--------------------------------------------------------------------------
  */

  async relist(id: string, merchantId: string): Promise<Product> {
    const product = await this.validateOwnership(id, merchantId);

    if (![ProductStatus.SOLD, ProductStatus.EXPIRED].includes(product.status)) {
      throw new BadRequestException(
        'Only sold or expired products can be relisted',
      );
    }

    const updatePayload: Partial<Product> = {
      status: ProductStatus.ACTIVE,
    };

    if (product.saleMethod === SaleMethod.AUCTION) {
      const duration = product.auctionDurationHours ?? 24;

      updatePayload.currentBid = null;

      updatePayload.auctionEndAt = new Date(
        Date.now() + duration * 60 * 60 * 1000,
      );
    }

    await this.repo.update(id, updatePayload);
    await this.bustProduct(id, merchantId);

    return this.findMerchantProduct(id, merchantId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // All admin mutations go through these
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── Methods ─────────────────────────────────────────────────────────────────

  /**
   * Admin-scoped findOne — no ownership check, includes deleted flag option.
   * Use this instead of findMerchantProduct when the caller is an admin.
   */
  async findOneAdmin(id: string, includeDeleted = false): Promise<Product> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.media', 'media')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.farm', 'farm')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .where('p.id = :id', { id });

    if (!includeDeleted) qb.andWhere('p.isDeleted = false');

    const product = await qb.getOne();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /**
   * Admin paginated list with full filter set.
   */
  findAllAdmin(pagination: PaginationDto, filters: ProductFilters = {}) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.media', 'media')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .leftJoinAndSelect('p.farm', 'farm')
      .where('p.isDeleted = false')
      .orderBy('p.createdAt', 'DESC');

    if (filters.status)
      qb.andWhere('p.status = :status', { status: filters.status });

    if (filters.saleMethod)
      qb.andWhere('p.saleMethod = :saleMethod', {
        saleMethod: filters.saleMethod,
      });

    if (filters.merchantId)
      qb.andWhere('p.merchantId = :merchantId', {
        merchantId: filters.merchantId,
      });

    if (filters.farmId)
      qb.andWhere('p.farmId = :farmId', { farmId: filters.farmId });

    if (filters.categoryId)
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });

    if (filters.search)
      qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q)', {
        q: `%${filters.search}%`,
      });

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  /**
   * Admin: sets product INACTIVE and soft-flags it.
   * Does NOT delete — merchant can still see it, just not buyers.
   */
  async deactivate(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<Product> {
    const product = await this.findOneAdmin(id);

    if (product.status === ProductStatus.INACTIVE) {
      throw new ConflictException('Product is already inactive.');
    }

    await this.repo.update(id, { status: ProductStatus.INACTIVE });

    this.logger.warn(
      `Product deactivated [id=${id}] by admin [${adminId}] — reason: ${reason}`,
    );

    await Promise.all([
      this.redis.del(CK.public(id)),
      this.redis.del(CK.stats()),
    ]);

    return this.findOneAdmin(id);
  }

  /**
   * Admin: reactivates an INACTIVE product back to ACTIVE.
   */
  async reactivate(id: string, adminId: string): Promise<Product> {
    const product = await this.findOneAdmin(id);

    if (product.status !== ProductStatus.INACTIVE) {
      throw new BadRequestException('Product is not inactive.');
    }

    await this.repo.update(id, { status: ProductStatus.ACTIVE });

    this.logger.log(`Product reactivated [id=${id}] by admin [${adminId}]`);
    await Promise.all([
      this.redis.del(CK.public(id)),
      this.redis.del(CK.stats()),
    ]);
    return this.findOneAdmin(id);
  }

  /**
   * Admin: live auction products only — sorted by soonest expiry.
   */
  getLiveAuctions(pagination: PaginationDto) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .leftJoinAndSelect('p.farm', 'farm')
      .leftJoinAndSelect('p.bids', 'bids')
      .where('p.saleMethod = :method', { method: SaleMethod.AUCTION })
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('p.isDeleted = false')
      .andWhere('p.auctionEndAt > :now', { now: new Date() })
      .orderBy('p.auctionEndAt', 'ASC');

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  /**
   * Admin dashboard stat block.
   */
  async getStats(): Promise<ProductStats> {
    const cached = await this.redis.get(CK.stats());
    if (cached) return JSON.parse(cached) as ProductStats;

    const rows = await this.repo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('p.saleMethod', 'saleMethod')
      .addSelect('COUNT(*)', 'count')
      .where('p.isDeleted = false')
      .groupBy('p.status')
      .addGroupBy('p.saleMethod')
      .getRawMany<{
        status: ProductStatus;
        saleMethod: SaleMethod;
        count: string;
      }>();

    const liveAuctions = await this.repo
      .createQueryBuilder('p')
      .where('p.saleMethod = :method', { method: SaleMethod.AUCTION })
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('p.auctionEndAt > :now', { now: new Date() })
      .andWhere('p.isDeleted = false')
      .getCount();

    const base: ProductStats = {
      total: 0,
      active: 0,
      sold: 0,
      expired: 0,
      inactive: 0,
      fixedPrice: 0,
      auction: 0,
      liveAuctions,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      base.total += count;

      if (row.saleMethod === SaleMethod.FIXED) base.fixedPrice += count;
      if (row.saleMethod === SaleMethod.AUCTION) base.auction += count;

      switch (row.status) {
        case ProductStatus.ACTIVE:
          base.active += count;
          break;
        case ProductStatus.SOLD:
          base.sold += count;
          break;
        case ProductStatus.EXPIRED:
          base.expired += count;
          break;
        case ProductStatus.INACTIVE:
          base.inactive += count;
          break;
      }
    }

    await this.redis.set(CK.stats(), JSON.stringify(base), TTL.stats);
    return base;
  }

  /*
  |--------------------------------------------------------------------------
  | Cache helpers
  |--------------------------------------------------------------------------
  */

  /**
   * Busts the public detail page and the owning merchant's list.
   * Call this after any mutation that changes what buyers or the merchant see.
   */
  private async bustProduct(id: string, merchantId: string): Promise<void> {
    await Promise.all([
      this.redis.del(CK.public(id)),
      this.redis.del(CK.merchant(merchantId)),
    ]);
  }
}
