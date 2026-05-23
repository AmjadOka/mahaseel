import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { BroadcastNotificationDto } from '../dto/index';

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
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcast(dto);
  }
}
