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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminProductsService } from '../services/admin-products.service';
import { DeactivateProductDto } from '../dto/index';

import { ProductStatus } from 'src/common/enums/product.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Admin — Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private readonly productsService: AdminProductsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all products, filterable by status & method' })
  @ApiQuery({ name: 'status', enum: ProductStatus, required: false })
  @ApiQuery({ name: 'saleMethod', enum: SaleMethod, required: false })
  getProducts(
    @Query() pagination: PaginationDto,
    @Query('status') status?: ProductStatus,
    @Query('saleMethod') saleMethod?: SaleMethod,
  ) {
    return this.productsService.getProducts(pagination, { status, saleMethod });
  }

  @Get('auctions/live')
  @ApiOperation({ summary: '[Admin] List all currently live auction products' })
  getLiveAuctions(@Query() pagination: PaginationDto) {
    return this.productsService.getLiveAuctions(pagination);
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: '[Admin] Deactivate a product listing — notifies merchant' })
  deactivateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateProductDto,
  ) {
    return this.productsService.deactivateProduct(id, dto.reason);
  }
}
