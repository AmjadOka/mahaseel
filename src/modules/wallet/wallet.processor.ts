/**
 * 
 * 
 
















// modules/wallet/wallet.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Order } from '../orders/entities/order.entity';
import { WalletService } from './wallet.service';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentStatus } from '../../common/enums/payment.enum';
import { WALLET_QUEUE, BALANCE_RELEASE_JOB } from './wallet.constants';
import { OrdersService } from '../orders/orders.service';

@Processor(WALLET_QUEUE)
export class WalletProcessor extends WorkerHost {
  private readonly logger = new Logger(WalletProcessor.name);

  constructor(
    private readonly orderservice: OrdersService,
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case BALANCE_RELEASE_JOB:
        await this.handleBalanceRelease();
        break;

      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async handleBalanceRelease(): Promise<void> {
    this.logger.log('Running balance-release job...');

    const holdDays = this.config.get<number>('app.walletHoldDays', 3);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - holdDays);

    // Completed orders paid before the hold cutoff, not yet released
    const orders = await this.orderservice
      .confirmCompleted('o')
      .innerJoin('payments', 'p', 'p.order_id = o.id')
      .where('o.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('o.balance_released IS DISTINCT FROM true')
      .andWhere('p.status = :paid', { paid: PaymentStatus.PAID })
      .andWhere('p.paid_at <= :cutoff', { cutoff })
      .select(['o.id', 'o.merchantId', 'o.netAmount'])
      .getRawMany();

    let released = 0;
    for (const order of orders) {
      try {
        await this.walletService.releasePending(
          order.o_merchant_id,
          parseFloat(order.o_net_amount),
          order.o_id,
        );

        await this.ordersRepo.query(
          `UPDATE orders SET balance_released = true WHERE id = $1`,
          [order.o_id],
        );

        released++;
      } catch (err) {
        // Log but continue — don't let one failure block the rest
        this.logger.error(
          `Failed to release balance for order ${order.o_id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Released balance for ${released} / ${orders.length} orders`,
    );
  }
}

 */
