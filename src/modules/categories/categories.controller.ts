// categories.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';
import { CategoriesService } from './categories.service';
import {
  CategoryFilterDto,
  CreateCategoryDto,
} from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Public } from 'src/common/decorators';
import type { FastifyRequest } from 'fastify';
import { FileValidationPipe } from '../upload/validation.pipe';

@ApiTags('Categories')
@Controller('categories')
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  // ── List ───────────────────────────────────────────────────────────────────

  // controller
  @Get()
  @Public()
  @ApiOperation({ summary: '[Public] List all categories (includes inactive)' })
  @ApiQuery({
    name: 'parentId',
    required: false,
    description: 'Filter by parent UUID. Pass "null" for top-level only.',
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(@Query() pagination: CategoryFilterDto) {
    const resolvedParentId =
      pagination.parentId === undefined
        ? null
        : pagination.parentId === 'null'
          ? null
          : pagination.parentId;

    return this.service.findAll(pagination, {
      parentId: resolvedParentId,
      isActive: pagination.isActive,
    });
  }
  @Get(':id')
  @Public()
  @ApiOperation({
    summary: '[Public] Get a single category with parent + children',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}

@ApiTags('Admin — Categories')
@Controller('admin/categories')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminCategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Post()
  @ApiOperation({
    summary: '[Admin] Create a category',
    description:
      'Creates the category record. To attach an icon, call ' +
      'PUT /admin/categories/:id/icon after creation.',
  })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  // ── Update (meta) ──────────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({
    summary:
      '[Admin] Update category name, slug, sortOrder, isActive, or parentId',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  // ── Replace icon ───────────────────────────────────────────────────────────

  @Patch(':id/icon')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Admin] Upload or replace the category icon' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['icon'],
      properties: { icon: { type: 'string', format: 'binary' } },
    },
  })
  async updateIcon(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
  ) {
    let file: Express.Multer.File | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file' && !file) {
        // take only the first file
        const buffer = await part.toBuffer();
        file = {
          fieldname: part.fieldname,
          originalname: part.filename,
          mimetype: part.mimetype,
          buffer,
          size: buffer.length,
          encoding: part.encoding,
        } as Express.Multer.File;
      }
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    new FileValidationPipe().transform(file); // validate file

    return this.service.updateIcon(id, file); // single file ✓
  }
  // ── Remove icon ────────────────────────────────────────────────────────────

  @Delete(':id/icon')
  @HttpCode(HttpStatus.NO_CONTENT) // ← matches products deleteMedia
  @ApiOperation({
    summary: '[Admin] Remove the category icon (deletes from Cloudinary)',
  })
  removeIcon(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeIcon(id);
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  @Patch(':id/toggle')
  @ApiOperation({ summary: '[Admin] Toggle isActive flag on a category' })
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleActive(id);
  }

  // ── Hard delete ────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Hard-delete a category' })
  @ApiResponse({ status: 409, description: 'Category still has children' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
