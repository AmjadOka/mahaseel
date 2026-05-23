import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminProductsService } from '../services/admin-products.service';
import { DeactivateProductDto } from '../dto/index';
import { ProductStatus } from 'src/common/enums/product.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SaleMethod } from 'src/common/enums/Unit.enum';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';

@ApiTags('Admin — Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private readonly productsService: AdminProductsService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List all products, filterable by status & method',
  })
  @ApiQuery({ name: 'status', enum: ProductStatus, required: false })
  @ApiQuery({ name: 'saleMethod', enum: SaleMethod, required: false })
  getProducts(
    @Query() pagination: PaginationDto,
    @Query('status') status?: ProductStatus,
    @Query('saleMethod') saleMethod?: SaleMethod,
  ) {
    return this.productsService.getAllProducts(pagination, {
      status,
      saleMethod,
    });
  }

  @Get('auctions/live')
  @ApiOperation({ summary: '[Admin] List all currently live auction products' })
  getLiveAuctions(@Query() pagination: PaginationDto) {
    return this.productsService.getLiveAuctions(pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Product counts by status and sale method' })
  getStats() {
    return this.productsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get a single product with full relations' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.getProduct(id);
  }

  @Put(':id/deactivate')
  @ApiOperation({
    summary: '[Admin] Deactivate a product listing — notifies merchant',
  })
  deactivateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateProductDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.productsService.deactivateProduct(id, {
      adminId: admin.sub,
      reason: dto.reason,
    });
  }

  @Put(':id/reactivate')
  @ApiOperation({
    summary: '[Admin] Reactivate a deactivated product — notifies merchant',
  })
  reactivateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.productsService.reactivateProduct(id, admin.sub);
  }
}
