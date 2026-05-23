/**
 * 
 







// modules/wallet/wallet.scheduler.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { WALLET_QUEUE, BALANCE_RELEASE_JOB } from './wallet.constants';

@Injectable()
export class WalletScheduler implements OnModuleInit {
  private readonly logger = new Logger(WalletScheduler.name);

  constructor(
    @InjectQueue(WALLET_QUEUE)
    private readonly walletQueue: Queue,
  ) {}

  async onModuleInit() {
    const existing = await this.walletQueue.getRepeatableJobs();
    for (const job of existing) {
      await this.walletQueue.removeRepeatableByKey(job.key);
    }

    await this.walletQueue.add(
      BALANCE_RELEASE_JOB,
      {},
      {
        repeat: { pattern: '0 2 * * *' }, // daily at 2 AM
        jobId: BALANCE_RELEASE_JOB,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
      },
    );

    this.logger.log('Scheduled: balance-release (daily 2 AM)');
  }
}
 */
