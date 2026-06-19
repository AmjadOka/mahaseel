import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from './entities/category.entity';
import { RedisService } from 'src/shared/redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { paginate } from 'src/shared/pagination/pagination.helper';
import { CategoryFilterDto } from 'src/common/dto/pagination.dto';

// ─── Cache keys ────────────────────────────────────────────────────────────────
// Centralised so every read and invalidation references the same string.
// Both the public and admin services share this namespace intentionally —
// a write from either side busts the same cached response.

const KEY = {
  tree: 'categories:tree',
  main: 'categories:main',
  children: (id: string) => `categories:children:${id}`,
  byId: (id: string) => `categories:id:${id}`,
  bySlug: (slug: string) => `categories:slug:${slug}`,
} as const;

/** Default TTL applied to every cached value (5 minutes). */
const TTL = 300;

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
    private readonly redis: RedisService,
    private readonly uploadService: UploadService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of categories.
   *
   * Cache strategy — only the two highest-traffic, filter-free paths are cached:
   * - `parentId === null`  → `categories:main`   (top-level list)
   * - `parentId === <id>`  → `categories:children:<id>`
   *
   * Any additional filter (e.g. `isActive`) bypasses the cache so admin
   * filtered views are always fresh without polluting the public cache.
   */
  async findAll(
    pagination: CategoryFilterDto,
    filters: { parentId?: string | null; isActive?: boolean } = {},
  ) {
    const isMainList =
      filters.parentId === null && filters.isActive === undefined;
    const isChildrenList = !!filters.parentId && filters.isActive === undefined;

    // ── Cache read ───────────────────────────────────────────────────────────
    if (isMainList) {
      const cached = await this.redis.get(KEY.main);
      if (cached) return JSON.parse(cached) as Category[];
    }

    if (isChildrenList) {
      const cached = await this.redis.get(
        KEY.children(filters.parentId as string),
      );
      if (cached) return JSON.parse(cached) as Category[];
    }

    // ── DB query ─────────────────────────────────────────────────────────────
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.parent', 'parent')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.nameEn', 'ASC');

    if (filters.parentId === null) {
      qb.where('c.parentId IS NULL');
    } else if (filters.parentId) {
      qb.where('c.parentId = :parentId', { parentId: filters.parentId });
    }

    if (filters.isActive !== undefined) {
      qb.andWhere('c.isActive = :isActive', { isActive: filters.isActive });
    }

    const result = await paginate(
      qb,
      Number(pagination.page),
      Number(pagination.limit),
    );

    // ── Cache write ──────────────────────────────────────────────────────────
    if (isMainList) {
      await this.redis.set(KEY.main, JSON.stringify(result), TTL);
    }

    if (isChildrenList) {
      await this.redis.set(
        KEY.children(filters.parentId as string),
        JSON.stringify(result),
        TTL,
      );
    }

    return result;
  }

  /**
   * Returns a single category with its `parent` and `children` relations.
   *
   * Cache strategy — keyed by `categories:id:<id>`.
   * Warmed on first read, busted by any write that touches this record.
   *
   * @throws {NotFoundException} when no category matches `id`.
   */
  async findOne(id: string): Promise<Category> {
    // ── Cache read ───────────────────────────────────────────────────────────
    const cached = await this.redis.get(KEY.byId(id));
    if (cached) return JSON.parse(cached) as Category;

    // ── DB query ─────────────────────────────────────────────────────────────
    const category = await this.repo.findOne({
      where: { id },
      relations: ['children', 'parent'],
    });
    if (!category) throw new NotFoundException('Category not found');

    // ── Cache write ──────────────────────────────────────────────────────────
    await this.redis.set(KEY.byId(id), JSON.stringify(category), TTL);

    return category;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new category without an icon.
   *
   * Icon upload is intentionally a separate step — the frontend uploads the
   * asset first (`PUT /:id/icon`) and then calls this endpoint, keeping the
   * creation payload small and atomic.
   *
   * @throws {ConflictException}  when `slug` is already taken.
   * @throws {NotFoundException}  when `parentId` does not exist.
   * @throws {BadRequestException} when `parentId` points to a sub-category
   *   (only one level of nesting is supported).
   */
  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug ?? this.generateSlug(dto.nameEn);

    await this.assertSlugUnique(slug);

    if (dto.parentId) {
      await this.assertParentExists(dto.parentId);
    }

    const category = this.repo.create({
      nameAr: dto.nameAr,
      nameEn: dto.nameEn,
      slug,
      parentId: dto.parentId ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      iconUrl: null,
      iconPublicId: null,
    });

    const saved = await this.repo.save(category);

    this.logger.log(`Category created [id=${saved.id}] slug="${slug}"`);

    // Bust the parent's children list and the top-level list so both
    // reflect the newly added entry immediately.
    await this.invalidateCache({ parentId: dto.parentId ?? undefined });

    return saved;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /**
   * Partially updates a category's metadata (name, slug, sortOrder, isActive,
   * or parentId). All fields are optional — only supplied fields are mutated.
   *
   * When `parentId` changes, the old parent's children cache is also busted
   * so both sides of the relationship stay consistent.
   *
   * @throws {NotFoundException}   when `id` or `parentId` does not exist.
   * @throws {ConflictException}   when the new `slug` is already taken.
   * @throws {BadRequestException} when `parentId === id` (self-reference) or
   *   when the new parent is itself a sub-category.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.slug && dto.slug !== category.slug) {
      await this.assertSlugUnique(dto.slug, id);
    }

    if (dto.parentId && dto.parentId !== category.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent.');
      }
      await this.assertParentExists(dto.parentId);
    }

    const oldParentId = category.parentId;

    Object.assign(category, {
      nameAr: dto.nameAr ?? category.nameAr,
      nameEn: dto.nameEn ?? category.nameEn,
      slug: dto.slug ?? category.slug,
      parentId: dto.parentId !== undefined ? dto.parentId : category.parentId,
      sortOrder: dto.sortOrder ?? category.sortOrder,
      isActive: dto.isActive ?? category.isActive,
    });

    const saved = await this.repo.save(category);

    this.logger.log(`Category updated [id=${id}]`);

    await this.invalidateCache({
      id,
      slug: saved.slug,
      // If the parent changed, bust the OLD parent's children list;
      // otherwise bust the current parent's list so it reflects the update.
      parentId:
        oldParentId !== saved.parentId
          ? (oldParentId ?? undefined)
          : (saved.parentId ?? undefined),
    });

    return saved;
  }

  // ── Update icon ────────────────────────────────────────────────────────────

  /**
   * Replaces the category icon with a new upload.
   *
   * The existing Cloudinary asset is deleted before the new one is uploaded
   * to prevent orphaned files accumulating in the media library.
   * `UploadService.delete()` is fire-and-forget — it never throws — so a
   * failed CDN delete will never block the DB update.
   *
   * @throws {NotFoundException} when `id` does not exist.
   */
  async updateIcon(
    id: string,
    iconFile: Express.Multer.File,
  ): Promise<Category> {
    const category = await this.findOne(id);

    if (category.iconPublicId) {
      await this.uploadService.delete(category.iconPublicId);
    }

    const upload = await this.uploadService.upload(iconFile, 'category');
    category.iconUrl = upload.url;
    category.iconPublicId = upload.publicId;

    const saved = await this.repo.save(category);

    this.logger.log(
      `Category icon updated [id=${id}] publicId=${upload.publicId}`,
    );
    await this.invalidateCache({ id, slug: saved.slug });

    return saved;
  }

  // ── Remove icon ────────────────────────────────────────────────────────────

  /**
   * Removes the category icon — deletes the Cloudinary asset and clears the
   * `iconUrl` / `iconPublicId` columns.
   *
   * `UploadService.delete()` is fire-and-forget — a failed CDN delete never
   * blocks the DB update.
   *
   * @throws {NotFoundException}   when `id` does not exist.
   * @throws {BadRequestException} when the category has no icon to remove.
   */
  async removeIcon(id: string): Promise<Category> {
    const category = await this.findOne(id);

    if (!category.iconPublicId) {
      throw new BadRequestException('This category has no icon to remove.');
    }

    await this.uploadService.delete(category.iconPublicId);

    category.iconUrl = null;
    category.iconPublicId = null;

    const saved = await this.repo.save(category);

    this.logger.log(`Category icon removed [id=${id}]`);
    await this.invalidateCache({ id, slug: saved.slug });

    return saved;
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  /**
   * Flips the `isActive` flag on a category.
   *
   * Deactivating a parent does **not** cascade to its children — the frontend
   * is responsible for communicating that inactive parents hide their children
   * from public views.
   *
   * @throws {NotFoundException} when `id` does not exist.
   */
  async toggleActive(id: string): Promise<Category> {
    const category = await this.findOne(id);
    category.isActive = !category.isActive;
    const saved = await this.repo.save(category);

    this.logger.log(`Category toggled [id=${id}] isActive=${saved.isActive}`);

    await this.invalidateCache({
      id,
      slug: saved.slug,
      parentId: saved.parentId ?? undefined,
    });

    return saved;
  }

  // ── Hard delete ────────────────────────────────────────────────────────────

  /**
   * Permanently deletes a category from the database.
   *
   * Guards:
   * - Refuses deletion if any child categories still reference this record as
   *   their parent. Caller must delete or reassign children first.
   *
   * Cloudinary cleanup is fire-and-forget — `UploadService.delete()` never
   * throws, so a failed CDN delete never blocks the DB row removal.
   *
   * @throws {NotFoundException}  when `id` does not exist.
   * @throws {ConflictException}  when the category still has sub-categories.
   */
  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);

    const childCount = await this.repo.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException(
        `Cannot delete: this category still has ${childCount} sub-categories. ` +
          'Delete or reassign them first.',
      );
    }

    if (category.iconPublicId) {
      await this.uploadService.delete(category.iconPublicId);
    }

    await this.repo.delete(id);

    this.logger.warn(
      `Category hard-deleted [id=${id}] slug="${category.slug}"`,
    );

    await this.invalidateCache({
      id,
      slug: category.slug,
      parentId: category.parentId ?? undefined,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Derives a URL-safe slug from an English category name.
   * Strips non-alphanumeric characters, collapses whitespace into hyphens,
   * and de-duplicates consecutive hyphens.
   */
  private generateSlug(nameEn: string): string {
    return nameEn
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /**
   * Asserts that no other category is using `slug`.
   * Pass `excludeId` during updates to allow a category to keep its own slug.
   *
   * @throws {ConflictException} when the slug is already taken.
   */
  private async assertSlugUnique(
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repo.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" is already in use.`);
    }
  }

  /**
   * Asserts that `parentId` refers to an existing top-level category.
   * Enforces a maximum nesting depth of one — a sub-category cannot itself
   * become a parent.
   *
   * @throws {NotFoundException}   when `parentId` does not exist.
   * @throws {BadRequestException} when the parent is already a sub-category.
   */
  private async assertParentExists(parentId: string): Promise<void> {
    const parent = await this.repo.findOne({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent category not found');

    if (parent.parentId !== null) {
      throw new BadRequestException(
        'Only one level of sub-categories is supported. ' +
          'The selected parent is already a sub-category.',
      );
    }
  }

  /**
   * Deletes all cache entries that could be stale after a write operation.
   *
   * Always busts:
   * - `categories:tree` — full tree used by nav/sidebar
   * - `categories:main` — top-level paginated list
   *
   * Conditionally busts:
   * - `categories:children:<parentId>` — the affected parent's children list
   * - `categories:id:<id>`            — the individual category record
   * - `categories:slug:<slug>`        — slug-based lookup (public storefront)
   */
  private async invalidateCache(
    opts: { id?: string; slug?: string; parentId?: string } = {},
  ): Promise<void> {
    const keys: string[] = [KEY.tree, KEY.main];

    if (opts.parentId) keys.push(KEY.children(opts.parentId));
    if (opts.id) keys.push(KEY.byId(opts.id));
    if (opts.slug) keys.push(KEY.bySlug(opts.slug));

    await Promise.all(keys.map((k) => this.redis.del(k)));
  }
}
