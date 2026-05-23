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
import { AdminWithdrawalsService } from '../services/admin-withdrawals.service';
import { ProcessWithdrawalDto } from '../dto/index';

import { WithdrawalStatus } from 'src/common/enums/withdrawal.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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
    return this.withdrawalsService.getAllWithdrawals(pagination, status);
  }

  @Get('pending')
  @ApiOperation({ summary: '[Admin] List pending withdrawal requests' })
  getPendingWithdrawals(@Query() pagination: PaginationDto) {
    return this.withdrawalsService.getPendingWithdrawals(pagination);
  }

  @Put(':id')
  @ApiOperation({ summary: '[Admin] Approve or reject a withdrawal' })
  processWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessWithdrawalDto,
  ) {
    return this.withdrawalsService.processWithdrawal(id, dto.action, dto.adminNotes);
  }
}
