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
import { AdminUsersService } from '../services/admin-users.service';

import { Role } from 'src/common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Admin — Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all users, optionally filtered by role' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  getUsers(@Query() pagination: PaginationDto, @Query('role') role?: Role) {
    return this.usersService.getUsers(pagination, role);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get full user profile with relations' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUser(id);
  }

  @Put(':id/suspend')
  @ApiOperation({ summary: '[Admin] Suspend user account — notifies user' })
  suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.usersService.suspendUser(id, reason);
  }

  @Put(':id/reinstate')
  @ApiOperation({ summary: '[Admin] Reinstate suspended user — notifies user' })
  reinstateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.reinstateUser(id);
  }
}
