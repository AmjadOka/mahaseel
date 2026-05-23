import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from 'src/common/types';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /* ─── Buyer ─── */

  @Post()
  @Roles(Role.BUYER)
  @ApiOperation({ summary: 'Place a fixed-price purchase request' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.sub, dto);
  }

  @Get('my')
  @Roles(Role.BUYER)
  @ApiOperation({ summary: 'List buyer own orders' })
  getBuyerOrders(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.ordersService.getBuyerOrders(user.sub, pagination);
  }

  @Delete(':id/cancel')
  @Roles(Role.BUYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending order' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.cancelOrder(id, user.sub);
  }

  /* ─── Merchant ─── */

  @Get('incoming')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'List incoming orders (merchant)' })
  getMerchantOrders(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.ordersService.getMerchantOrders(user.sub, pagination);
  }

  @Put(':id/accept')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Accept an order — reveals buyer phone' })
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.acceptOrder(id, user.sub);
  }

  @Put(':id/reject')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Reject an order' })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body('reason') reason: string,
  ) {
    return this.ordersService.rejectOrder(id, user.sub, reason);
  }

  @Put(':id/confirm')
  @Roles(Role.BUYER)
  @ApiOperation({ summary: 'Buyer confirms delivery completion' })
  confirmOrder(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.confirmCompleted(id, user.sub);
  }

  @Put(':id/status')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Update order delivery status' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateDeliveryStatus(id, user.sub, dto);
  }

  /* ─── Shared ─── */

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order (buyer or merchant)' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.findOneForUser(id, user);
  }
}
