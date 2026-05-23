// modules/notifications/notifications.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { NotificationsService } from './services/notifications.service';
import {
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_CLEANUP_JOB,
} from './notifications.constants';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case NOTIFICATION_CLEANUP_JOB:
        this.logger.log('Running notification-cleanup job...');
        await this.notificationsService.cleanupOldNotifications();
        break;

      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }
}
