// modules/orders/orders.scheduler.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ORDERS_QUEUE, PAYMENT_REMINDER_JOB } from './orders.constants';

@Injectable()
export class OrdersScheduler implements OnModuleInit {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(
    @InjectQueue(ORDERS_QUEUE)
    private readonly ordersQueue: Queue,
  ) {}

  async onModuleInit() {
    const existing = await this.ordersQueue.getRepeatableJobs();
    for (const job of existing) {
      await this.ordersQueue.removeRepeatableByKey(job.key);
    }

    await this.ordersQueue.add(
      PAYMENT_REMINDER_JOB,
      {},
      {
        repeat: { pattern: '0 */6 * * *' }, // every 6 hours
        jobId: PAYMENT_REMINDER_JOB,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
      },
    );

    this.logger.log('Scheduled: payment-reminder (every 6 hours)');
  }
}
