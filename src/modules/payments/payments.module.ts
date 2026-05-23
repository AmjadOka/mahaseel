import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeProvider } from './stripe.provider';
import { MailService } from './mails/mail.service';
import { PaymentProcess } from './payments.process';
import { PaymentSchedular } from './payments.schedular';
import { BullModule } from '@nestjs/bullmq';
import { PAYMENT_QUEUE } from './payments.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    WalletModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: PAYMENT_QUEUE,
    }),
  ],
  providers: [
    PaymentsService,
    StripeProvider,
    MailService,
    PaymentProcess,
    PaymentSchedular,
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
