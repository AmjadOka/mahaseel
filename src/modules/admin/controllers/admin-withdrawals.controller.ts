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
import { AdminWithdrawalsService } from '../services/admin-withdrawals.service';
import { ProcessWithdrawalDto } from '../dto/index';
import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import type { AuthUser } from 'src/common/types';
import { CurrentUser } from 'src/common/decorators';

@ApiTags('Admin — Withdrawals')
@Controller('admin/withdrawals')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminWithdrawalsController {
  constructor(private readonly withdrawalsService: AdminWithdrawalsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all withdrawal requests' })
  @ApiQuery({ name: 'status', enum: WithdrawalStatus, required: false })
  getAllWithdrawals(
    @Query() pagination: PaginationDto,
    @Query('status') status?: WithdrawalStatus,
  ) {
    return this.withdrawalsService.getWithdrawals(pagination, { status });
  }

  @Get('pending')
  @ApiOperation({ summary: '[Admin] List pending withdrawal requests' })
  getPendingWithdrawals(@Query() pagination: PaginationDto) {
    return this.withdrawalsService.getPendingWithdrawals(pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Withdrawal counts and amounts by status' })
  getStats() {
    return this.withdrawalsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get a single withdrawal request' })
  @ApiResponse({ status: 404, description: 'Withdrawal not found' })
  getWithdrawal(@Param('id', ParseUUIDPipe) id: string) {
    return this.withdrawalsService.getWithdrawal(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '[Admin] Approve or reject a withdrawal' })
  @ApiResponse({ status: 400, description: 'Already processed' })
  processWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessWithdrawalDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.withdrawalsService.processWithdrawal(id, {
      action: dto.action,
      adminNotes: dto.adminNotes,
      adminId: admin.sub,
    });
  }
}
