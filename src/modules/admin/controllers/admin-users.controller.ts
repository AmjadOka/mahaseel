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
import { AdminUsersService } from '../services/admin-users.service';
import { AdminUsersQueryDto, SuspendUserDto } from '../dto/index';
import { Role } from 'src/common/enums/role.enum';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';

@ApiTags('Admin — Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List all users, optionally filtered by role',
  })
  @ApiQuery({
    name: 'role',
    enum: Role,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list',
  })
  getUsers(@Query() query: AdminUsersQueryDto) {
    const { role, ...pagination } = query;

    return this.usersService.getUsers(pagination, { role });
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] User counts grouped by role and status' })
  getStats() {
    return this.usersService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get full user profile with relations' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUser(id);
  }

  @Get('pending-merchants')
  @ApiOperation({
    summary: '[Admin] List users with pending merchant role requests',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list',
  })
  getPendingMerchantsRoleRequests() {
    return this.usersService.getPendingMerchantsRoleRequests();
  }

  @Put(':id/suspend')
  @ApiOperation({ summary: '[Admin] Suspend user account — notifies user' })
  @ApiResponse({ status: 409, description: 'Already suspended or is an admin' })
  suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.suspendUser(id, {
      adminId: admin.sub,
      reason: dto.reason,
    });
  }

  @Put(':id/reinstate')
  @ApiOperation({ summary: '[Admin] Reinstate suspended user — notifies user' })
  @ApiResponse({ status: 409, description: 'User is already active' })
  reinstateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.reinstateUser(id, { adminId: admin.sub });
  }

  @Put(':id/make-merchant')
  @ApiOperation({
    summary: '[Admin] Promote user to merchant role — notifies user',
  })
  @ApiResponse({ status: 409, description: 'User is already a merchant' })
  approveMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.approvePromotion(id, admin.sub);
  }

  @Put(':id/reject-merchant')
  @ApiOperation({
    summary: '[Admin] Reject user merchant role request — notifies user',
  })
  @ApiResponse({ status: 409, description: 'User is not a merchant' })
  rejectMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() notes?: string,
  ) {
    return this.usersService.rejectPromotion(id, admin.sub, notes);
  }
}
