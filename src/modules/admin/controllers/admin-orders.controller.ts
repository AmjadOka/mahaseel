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
import { AdminOrdersService } from '../services/admin-orders.service';
import { ForceOrderActionDto } from '../dto/index';

import { OrderStatus } from 'src/common/enums/order-status.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Admin — Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all orders, filterable by status and date' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getOrders(
    @Query() pagination: PaginationDto,
    @Query('status') status?: OrderStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ordersService.getOrders(pagination, { status, from, to });
  }

  @Get('disputes')
  @ApiOperation({
    summary: '[Admin] List open disputes — accepted orders unpaid > 24h',
  })
  getOpenDisputes(@Query() pagination: PaginationDto) {
    return this.ordersService.getOpenDisputes(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get full order detail' })
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getOrder(id);
  }

  @Put(':id/force-cancel')
  @ApiOperation({
    summary: '[Admin] Force-cancel a disputed order — notifies buyer & merchant',
  })
  forceCancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceOrderActionDto,
  ) {
    return this.ordersService.forceCancel(id, dto.reason ?? 'Cancelled by admin');
  }

  @Put(':id/force-complete')
  @ApiOperation({
    summary: '[Admin] Force-complete a stuck order — notifies buyer & merchant',
  })
  forceComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceOrderActionDto,
  ) {
    return this.ordersService.forceComplete(id, dto.reason ?? 'Completed by admin');
  }
}
