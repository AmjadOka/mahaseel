import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { PaymentsService } from './payments.service';
import {
  CLOSE_EXPIRED_PAYMENTS_JOB,
  PAYMENT_QUEUE,
} from './payments.constants';

@Processor(PAYMENT_QUEUE)
export class PaymentProcess extends WorkerHost {
  private readonly logger = new Logger(PaymentProcess.name);

  constructor(private readonly paymentsService: PaymentsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CLOSE_EXPIRED_PAYMENTS_JOB:
        this.logger.log('Running close-expired-payments job');
        await this.paymentsService.cancelUnpaidOrders();
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
