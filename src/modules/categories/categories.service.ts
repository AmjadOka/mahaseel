import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Category } from './entities/category.entity';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
    private readonly uploadService: UploadService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Returns all active root categories with their immediate children. */
  async findAll(): Promise<Category[]> {
    return this.repo.find({
      where: { isActive: true, parentId: IsNull() },
      relations: ['children'],
      order: { sortOrder: 'ASC', nameAr: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Category> {
    const cat = await this.repo.findOne({
      where: { id, isActive: true },
      relations: ['children', 'parent'],
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug ?? this.toSlug(dto.nameAr, dto.nameEn);

    await this.assertSlugUnique(slug);

    const cat = this.repo.create({ ...dto, slug });
    return this.repo.save(cat);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const cat = await this.findOne(id);

    if (dto.slug && dto.slug !== cat.slug) {
      await this.assertSlugUnique(dto.slug);
    }

    Object.assign(cat, dto);
    return this.repo.save(cat);
  }

  /** Soft-delete: sets isActive = false, never removes the row. */
  async remove(id: string): Promise<void> {
    const cat = await this.findOne(id);
    cat.isActive = false;
    await this.repo.save(cat);
  }

  // ── Icon upload ────────────────────────────────────────────────────────────

  /**
   * Uploads or replaces the category icon.
   * Old Cloudinary asset is deleted only after the new one is confirmed.
   */
  async uploadIcon(id: string, file: Express.Multer.File): Promise<Category> {
    const cat = await this.findOne(id);

    const uploaded = cat.iconPublicId
      ? await this.uploadService.replace(file, 'category', cat.iconPublicId)
      : await this.uploadService.upload(file, 'category');

    cat.iconUrl = uploaded.url;
    cat.iconPublicId = uploaded.publicId;
    return this.repo.save(cat);
  }

  /** Removes the icon from Cloudinary and clears the DB fields. */
  async removeIcon(id: string): Promise<Category> {
    const cat = await this.findOne(id);

    if (!cat.iconPublicId) {
      throw new NotFoundException('This category has no icon');
    }

    await this.uploadService.delete(cat.iconPublicId);

    cat.iconUrl = null;
    cat.iconPublicId = null;
    return this.repo.save(cat);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Generates a URL-safe slug.
   * Prefers the English name; falls back to a romanised Arabic name.
   * Example: "خضروات" → "khdrwat", "Vegetables" → "vegetables"
   */
  private toSlug(nameAr: string, nameEn?: string): string {
    const base = nameEn ?? nameAr;
    return base
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\w\u0600-\u06FF-]/g, '') // keep arabic chars, latin, digits, dash
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async assertSlugUnique(slug: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Slug "${slug}" is already taken`);
    }
  }
}
