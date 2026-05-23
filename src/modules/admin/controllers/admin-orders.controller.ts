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
import { AdminOrdersService } from '../services/admin-orders.service';
import { ForceOrderActionDto } from '../dto/index';
import { DateRangeDto } from '../dto/index';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';

@ApiTags('Admin — Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List all orders, filterable by status and date',
  })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  getOrders(
    @Query() pagination: PaginationDto,
    @Query() range: DateRangeDto,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.getOrders(pagination, {
      status,
      from: range.from,
      to: range.to,
    });
  }

  @Get('disputes')
  @ApiOperation({
    summary:
      '[Admin] List open disputes — AWAITING_PAYMENT orders unpaid > 24h',
  })
  getOpenDisputes(@Query() pagination: PaginationDto) {
    return this.ordersService.getOpenDisputes(pagination);
  }

  @Get('stats')
  @ApiOperation({
    summary: '[Admin] Order counts and revenue grouped by status',
  })
  getStats() {
    return this.ordersService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get full order detail' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getOrder(id);
  }

  @Put(':id/force-cancel')
  @ApiOperation({
    summary:
      '[Admin] Force-cancel a disputed order — notifies buyer & merchant',
  })
  @ApiResponse({
    status: 400,
    description: 'Order already completed or cancelled',
  })
  forceCancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceOrderActionDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.ordersService.forceCancel(
      id,
      admin.sub,
      dto.reason ?? 'Cancelled by admin',
    );
  }

  @Put(':id/force-complete')
  @ApiOperation({
    summary: '[Admin] Force-complete a stuck order — notifies buyer & merchant',
  })
  @ApiResponse({
    status: 400,
    description: 'Order already completed or cancelled',
  })
  forceComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceOrderActionDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.ordersService.forceComplete(
      id,
      admin.sub,
      dto.reason ?? 'Completed by admin',
    );
  }
}
