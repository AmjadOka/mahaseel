import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { BroadcastNotificationDto } from '../dto/index';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';

@ApiTags('Admin — Notifications')
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
  ) {}

  @Post('broadcast')
  @ApiOperation({
    summary:
      '[Admin] Broadcast a notification — to specific users, a role, or everyone',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns sent/failed counts and target summary',
  })
  broadcast(
    @Body() dto: BroadcastNotificationDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.notificationsService.broadcast(dto, admin.sub, admin.phone);
  }
}
