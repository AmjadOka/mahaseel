import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminReportsService } from '../services/admin-reports.service';

@ApiTags('Admin — Reports')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminReportsController {
  constructor(private readonly reportsService: AdminReportsService) {}

  @Get('revenue')
  @ApiOperation({ summary: '[Admin] Daily revenue report — filterable by date range' })
  @ApiQuery({ name: 'from', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2025-12-31' })
  getRevenueReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getRevenueReport(from, to);
  }

  @Get('revenue/monthly')
  @ApiOperation({ summary: '[Admin] Monthly revenue summary for a given year' })
  @ApiQuery({ name: 'year', required: false, example: 2025 })
  getMonthlySummary(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.reportsService.getMonthlySummary(year);
  }

  @Get('merchants/top')
  @ApiOperation({ summary: '[Admin] Top merchants by revenue — filterable by date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTopMerchants(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.reportsService.getTopMerchants(from, to, limit);
  }
}
