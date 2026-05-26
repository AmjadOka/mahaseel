import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NotificationsService } from './services/notifications.service';
import { CurrentUser } from 'src/common/decorators';
import type { AuthUser } from 'src/common/types';
import { Observable } from 'rxjs';
import type { Response } from 'express';
import { NotificationsSseService } from './services/notifications-sse.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseService: NotificationsSseService,
  ) {}

  // ── SSE stream ─────────────────────────────────────────────────────────────

  /**
   * Client opens this once on login and keeps it alive.
   * Every new notification for this user arrives as a JSON-encoded MessageEvent.
   *
   * Client usage (JavaScript):
   *
   *   const es = new EventSource('/notifications/stream', { withCredentials: true });
   *   es.onmessage = (e) => {
   *     const { count, title, body, titleAr, type } = JSON.parse(e.data);
   *     updateBadge(count);
   *     showToast({ title: titleAr ?? title, body });
   *   };
   *   es.onerror = () => es.close(); // reconnect logic handled by the browser
   */
  @Sse('stream')
  stream(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    // Keep the connection alive — browser auto-reconnects on drop
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

    return this.sseService.connect(user.sub);
  }

  // ── Unread count — for initial badge load ──────────────────────────────────

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
}
