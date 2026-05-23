// modules/orders/orders.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order } from './entities/order.entity';
import { NotificationsService } from '../notifications/services/notifications.service';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentStatus } from '../../common/enums/payment.enum';
import { NotificationType } from '../../common/enums/notification.enum';
import { ORDERS_QUEUE, PAYMENT_REMINDER_JOB } from './orders.constants';

@Processor(ORDERS_QUEUE)
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PAYMENT_REMINDER_JOB:
        await this.handlePaymentReminder();
        break;

      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async handlePaymentReminder(): Promise<void> {
    this.logger.log('Running payment-reminder job...');

    // Remind buyers of accepted orders that have been unpaid for 30+ minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const unpaidOrders = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('payments', 'p', 'p.order_id = o.id AND p.status = :paid', {
        paid: PaymentStatus.PAID,
      })
      .where('o.status = :status', { status: OrderStatus.ACCEPTED })
      .andWhere('p.id IS NULL')
      .andWhere('o.updated_at <= :cutoff', { cutoff: thirtyMinAgo })
      .select(['o.id', 'o.buyerId', 'o.finalPrice'])
      .limit(200)
      .getRawMany();

    for (const order of unpaidOrders) {
      await this.notificationsService.notify(order.o_buyer_id, {
        title: '',
        body: '',
        type: NotificationType.PAYMENT_REQUIRED,
        titleAr: 'تذكير: إتمام الدفع',
        bodyAr: `طلبك مقبول ويحتاج إلى إتمام الدفع (${order.o_final_price} ريال). لا تؤخر!`,
        referenceType: 'order',
        referenceId: order.o_id,
      });
    }

    this.logger.log(`Sent ${unpaidOrders.length} payment reminders`);
  }
}
