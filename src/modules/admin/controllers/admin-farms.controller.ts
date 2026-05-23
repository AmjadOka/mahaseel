import {
  Controller,
  Get,
  Put,
  Delete,
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
import { AdminFarmsService } from '../services/admin-farms.service';
import { RejectFarmDto } from '../dto/index';
import { FarmStatus } from 'src/common/enums/farm.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';

@ApiTags('Admin — Farms')
@Controller('admin/farms')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminFarmsController {
  constructor(private readonly farmsService: AdminFarmsService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List all farms, optionally filtered by status',
  })
  @ApiQuery({ name: 'status', enum: FarmStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  getAllFarms(
    @Query() pagination: PaginationDto,
    @Query('status') status?: FarmStatus,
    @Query('search') search?: string,
  ) {
    return this.farmsService.getAllFarms(pagination, status, search);
  }

  @Get('pending')
  @ApiOperation({ summary: '[Admin] List farms awaiting approval' })
  getPendingFarms(@Query() pagination: PaginationDto) {
    return this.farmsService.getPendingFarms(pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Farm counts by status' })
  getStats() {
    return this.farmsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get a single farm with full relations' })
  @ApiResponse({ status: 404, description: 'Farm not found' })
  getFarm(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.getFarmById(id);
  }

  @Put(':id/approve')
  @ApiOperation({ summary: '[Admin] Approve a farm — notifies owner' })
  @ApiResponse({
    status: 409,
    description: 'Farm already processed (idempotency guard)',
  })
  approveFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.farmsService.approveFarm(id, { adminId: admin.sub });
  }

  @Put(':id/reject')
  @ApiOperation({
    summary: '[Admin] Reject a farm — notifies owner with reason',
  })
  rejectFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectFarmDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.farmsService.rejectFarm(id, {
      adminId: admin.sub,
      reason: dto.reason,
    });
  }

  @Put(':id/suspend')
  @ApiOperation({
    summary: '[Admin] Suspend an approved farm — notifies owner',
  })
  suspendFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectFarmDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.farmsService.suspendFarm(id, {
      adminId: admin.sub,
      reason: dto.reason,
    });
  }

  @Put(':id/unsuspend')
  @ApiOperation({
    summary: '[Admin] Lift suspension — re-approves farm, notifies owner',
  })
  unsuspendFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.farmsService.unsuspendFarm(id, { adminId: admin.sub });
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Hard-delete a farm record — irreversible' })
  hardDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.farmsService.hardDelete(id, admin.sub);
  }
}
