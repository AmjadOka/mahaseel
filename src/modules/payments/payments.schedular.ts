// modules/auctions/auctions.scheduler.ts
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
    private readonly auctionsQueue: Queue,
  ) {}

  async onModuleInit() {
    const schedulers = await this.auctionsQueue.getJobSchedulers();

    await Promise.all(
      schedulers
        .filter((s): s is typeof s & { id: string } => !!s.id)
        .map((s) => this.auctionsQueue.removeJobScheduler(s.id)),
    );

    // Create/update scheduler
    await this.auctionsQueue.upsertJobScheduler(
      CLOSE_EXPIRED_PAYMENTS_JOB, // scheduler id
      {
        pattern: '* * * * *', // every minute
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

    this.logger.log('Scheduled: close-expired-auctions (every minute)');
  }
}
