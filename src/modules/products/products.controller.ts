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
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ProductsService } from './products.service';

import {
  CreateProductDto,
  FilterMarketDto,
  UpdateProductDto,
} from './dto/create-product.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { CurrentUser, Public, Roles } from '../../common/decorators';

import { Role } from 'src/common/enums/role.enum';

import { ProductStatus } from 'src/common/enums/product.enum';

import type { AuthUser } from 'src/common/types';
import { FilesValidationPipe } from '../upload/validation.pipe';

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
  findMerchantProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.findMerchantProduct(id, user.sub);
  }

  @Patch(':id')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
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
  relist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.relist(id, user.sub);
  }

  /*
  |--------------------------------------------------------------------------
  | Media
  |--------------------------------------------------------------------------
  */

  @Patch(':id/media')
  @Roles(Role.MERCHANT)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload product images/videos (max 10)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    const files: Express.Multer.File[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        files.push({
          fieldname: part.fieldname,
          originalname: part.filename,
          mimetype: part.mimetype,
          buffer,
          size: buffer.length,
          encoding: part.encoding,
        } as Express.Multer.File);
      }
    }

    if (!files.length) {
      throw new BadRequestException('No files provided');
    }

    new FilesValidationPipe().transform(files);

    return this.productsService.uploadMedia(id, user.sub, files);
  }

  @Delete(':id/media/:mediaId')
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product media item' })
  deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.deleteMedia(id, mediaId, user.sub);
  }
}

@ApiTags('Market')
@Controller('market')
export class MarketController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /market
   * Public — no auth required. Buyers and guests can browse.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Browse marketplace products' })
  browse(@Query() filters: FilterMarketDto) {
    return this.productsService.searchMarket(filters);
  }

  /**
   * GET /market/:id
   * Public — product detail page.
   */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get product detail (public view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findPublicProduct(id);
  }
}
