import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CLOSE_EXPIRED_PAYMENTS_JOB,
  PAYMENT_QUEUE,
} from './payments.constants';

@Injectable()
export class PaymentSchedular implements OnModuleInit {
  private readonly logger = new Logger(PaymentSchedular.name);

  constructor(
    @InjectQueue(PAYMENT_QUEUE)
    private readonly paymentQueue: Queue,
  ) {}

  async onModuleInit() {
    const schedulers = await this.paymentQueue.getJobSchedulers();

    await Promise.all(
      schedulers
        .filter((s): s is typeof s & { id: string } => !!s.id)
        .map((s) => this.paymentQueue.removeJobScheduler(s.id)),
    );

    // Create/update scheduler
    await this.paymentQueue.upsertJobScheduler(
      CLOSE_EXPIRED_PAYMENTS_JOB, // scheduler id
      {
        pattern: '0 */30 * * * *',
      },
      {
        name: CLOSE_EXPIRED_PAYMENTS_JOB,
        data: {},
        opts: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );

    this.logger.log('CLOSE_EXPIRED_PAYMENTS_JOB (every minute)');
  }
}
