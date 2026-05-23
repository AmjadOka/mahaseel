import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NotificationsService } from './services/notifications.service';
import { CurrentUser } from 'src/common/decorators';
import { RegisterFcmDto } from './dto/register-fcm-token.dto';
import type { AuthUser } from 'src/common/types';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Notification endpoints ───────────────────────────────────────────────

  @Get()
  getAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.notificationsService.getAll(user.sub, page, limit);
  }

  @Get('unread')
  getUnread(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnread(user.sub);
  }

  @Get('unread/count')
  countUnread(@CurrentUser() user: AuthUser) {
    return this.notificationsService.countUnread(user.sub);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.markAsRead(id, user.sub);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.sub);
  }

  // ─── FCM Token endpoints ──────────────────────────────────────────────────

  @Post('fcm-token')
  registerFcmToken(@CurrentUser() user: AuthUser, @Body() dto: RegisterFcmDto) {
    return this.notificationsService.registerFcmToken(
      user.sub,
      dto.token,
      dto.platform,
    );
  }

  @Delete('fcm-token')
  removeFcmToken(@CurrentUser() user: AuthUser, @Body('token') token: string) {
    return this.notificationsService.removeFcmToken(user.sub, token);
  }
}
