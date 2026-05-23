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
import { AdminFarmsService } from '../services/admin-farms.service';
import { RejectFarmDto } from '../dto/index';

import { FarmStatus } from 'src/common/enums/farm.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Admin — Farms')
@Controller('admin/farms')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminFarmsController {
  constructor(private readonly farmsService: AdminFarmsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all farms, optionally filtered by status' })
  @ApiQuery({ name: 'status', enum: FarmStatus, required: false })
  getAllFarms(@Query() pagination: PaginationDto, @Query('status') status?: FarmStatus) {
    return this.farmsService.getAllFarms(pagination, status);
  }

  @Get('pending')
  @ApiOperation({ summary: '[Admin] List farms awaiting approval' })
  getPendingFarms(@Query() pagination: PaginationDto) {
    return this.farmsService.getPendingFarms(pagination);
  }

  @Put(':id/approve')
  @ApiOperation({ summary: '[Admin] Approve a farm — notifies owner' })
  approveFarm(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmsService.approveFarm(id);
  }

  @Put(':id/reject')
  @ApiOperation({ summary: '[Admin] Reject a farm — notifies owner with reason' })
  rejectFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectFarmDto,
  ) {
    return this.farmsService.rejectFarm(id, dto.reason);
  }
}
