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
  UploadedFiles,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
  BadRequestException,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { FilesInterceptor } from '@nestjs/platform-express';

import { ProductsService } from './products.service';

import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { CurrentUser, Roles } from '../../common/decorators';

import { Role } from 'src/common/enums/role.enum';

import { ProductStatus } from 'src/common/enums/product.enum';

import type { AuthUser } from 'src/common/types';
import { FileValidationPipe } from '../upload/validation.pipe';
import { memoryStorage } from 'multer';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /*
  |--------------------------------------------------------------------------
  | Merchant Products
  |--------------------------------------------------------------------------
  */

  @Get()
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'List merchant own products' })
  findAll(
    @CurrentUser() user: AuthUser,

    @Query(
      'status',
      new ParseEnumPipe(ProductStatus, {
        optional: true,
      }),
    )
    status?: ProductStatus,
  ) {
    return this.productsService.findMyProducts(user.sub, status);
  }

  @Post()
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Create product listing' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.sub, dto);
  }

  @Get(':id')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Get product detail (merchant view)' })
  findMerchantProduct(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.productsService.findMerchantProduct(id, user.sub);
  }

  @Patch(':id')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.productsService.softDelete(id, user.sub);
  }

  /*
  |--------------------------------------------------------------------------
  | Relist
  |--------------------------------------------------------------------------
  */

  @Patch(':id/relist')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Re-list a sold or expired product' })
  relist(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.productsService.relist(id, user.sub);
  }

  /*
  |--------------------------------------------------------------------------
  | Media
  |--------------------------------------------------------------------------
  */

  @Post(':id/media')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Upload product images/videos (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }), // ← memoryStorage: file.buffer populated, never disk
  )
  uploadMedia(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('No files provided');
    }

    // Validate each file individually (type + size) before hitting Cloudinary
    const pipe = new FileValidationPipe();
    files.forEach((f) => pipe.transform(f));

    return this.productsService.uploadMedia(id, user.sub, files);
  }

  @Delete(':id/media/:mediaId')
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product media item' })
  deleteMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.deleteMedia(id, mediaId, user.sub);
  }
}
