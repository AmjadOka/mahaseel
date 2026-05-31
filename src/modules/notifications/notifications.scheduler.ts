// modules/notifications/notifications.scheduler.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_CLEANUP_JOB,
} from './notifications.constants';

@Injectable()
export class NotificationsScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  async onModuleInit() {
    const existing = await this.notificationsQueue.getJobSchedulers();
    for (const job of existing) {
      await this.notificationsQueue.removeJobScheduler(job.key);
    }

    await this.notificationsQueue.add(
      NOTIFICATION_CLEANUP_JOB,
      {},
      {
        repeat: { pattern: '0 3 * * 0' }, // Sunday at 3 AM
        jobId: NOTIFICATION_CLEANUP_JOB,
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 3 },
      },
    );

    this.logger.log('Scheduled: notification-cleanup (Sunday 3 AM)');
  }
}
