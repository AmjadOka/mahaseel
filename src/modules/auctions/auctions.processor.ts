// modules/auctions/auctions.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { AuctionsService } from './auctions.service';
import {
  AUCTIONS_QUEUE,
  CLOSE_EXPIRED_AUCTIONS_JOB,
} from './auctions.constants';

@Processor(AUCTIONS_QUEUE)
export class AuctionsProcessor extends WorkerHost {
  private readonly logger = new Logger(AuctionsProcessor.name);

  constructor(private readonly auctionsService: AuctionsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CLOSE_EXPIRED_AUCTIONS_JOB:
        this.logger.log('Running close-expired-auctions job');
        await this.auctionsService.closeExpiredAuctions();
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
