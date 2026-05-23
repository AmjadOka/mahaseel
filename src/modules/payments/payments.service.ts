// ─────────────────────────────────────────────────────────────────────────────
// payments.service.ts
//
// Required env variables:
//   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET  whsec_…
//   APP_URL                https://yourapp.com
//   PAYMENT_EXPIRY_HOURS   (optional, default 25 — belt-and-suspenders beyond
//                           Stripe's 24 h session TTL)
//
// Required Stripe webhook events (Dashboard → Webhooks):
//   • checkout.session.completed
//   • checkout.session.expired
//   • payment_intent.payment_failed
//
// main.ts — register BEFORE any JSON body-parser middleware:
//   app.use('/payments/webhook', express.raw({ type: 'application/json' }));
//
// npm install @nestjs/schedule  (for the cron job)
// Register ScheduleModule.forRoot() in your root AppModule.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { MailService } from './mails/mail.service';
import { STRIPE_CLIENT } from './stripe.provider';
import {
  OrderStatus,
  DeliveryStatus,
} from 'src/common/enums/order-status.enum';
import { PaymentStatus } from 'src/common/enums/payment.enum';
import { ProductStatus } from 'src/common/enums/product.enum';
import { SaleMethod } from 'src/common/enums/Unit.enum.ts';
import { NotificationType } from 'src/common/enums/notification.enum';

// ─── Inline Stripe type helpers ──────────────────────────────────────────────

type StripeWebhookEvent = ReturnType<
  Stripe.Stripe['webhooks']['constructEvent']
>;

interface CheckoutSessionData {
  payment_intent: string | null;
  metadata: Record<string, string> | null;
}

interface PaymentIntentData {
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,

    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe.Stripe,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Auto-initiate (called internally by acceptOrder / acceptBid) ─────────

  /**
   * Creates a Stripe Checkout Session for an order that has just been accepted,
   * then delivers the payment URL to the buyer via email AND in-app notification.
   *
   * Called by OrdersService.acceptOrder() and AuctionsService.acceptBid() /
   * AuctionsService.closeExpiredAuctions() **after** their DB transaction commits.
   * Must never be called inside a transaction — it talks to Stripe's API.
   *
   * Idempotent: if a PENDING payment record with a session URL already exists
   * for this order, the existing URL is re-sent without creating a new session.
   *
   * @param orderId      - UUID of the accepted order.
   * @param buyerId      - UUID of the buyer (for Payment record + notifications).
   * @param buyerEmail   - Email address to send the payment link to.
   * @param productName  - Human-readable product name for the Stripe line-item.
   * @param finalPrice   - Gross amount in usd .
   */
  async autoInitiateForOrder(
    orderId: string,
    buyerId: string,
    buyerEmail: string,
    productName: string,
    finalPrice: number,
  ): Promise<void> {
    // ── Idempotency: reuse an existing pending session ─────────────────────
    let payment = await this.paymentsRepo.findOne({ where: { orderId } });

    if (payment?.status === PaymentStatus.PAID) {
      this.logger.warn(
        `autoInitiateForOrder: order ${orderId} already paid — skipping`,
      );
      return;
    }

    let paymentUrl: string;

    if (payment?.gatewayUrl) {
      // An active session exists — re-deliver the URL without hitting Stripe again.
      paymentUrl = payment.gatewayUrl;
    } else {
      // ── Create local Payment record ──────────────────────────────────────
      if (!payment) {
        payment = this.paymentsRepo.create({
          orderId,
          buyerId,
          amount: finalPrice,
          status: PaymentStatus.PENDING,
          paymentGateway: 'stripe',
        });
        payment = await this.paymentsRepo.save(payment);
      }

      const appUrl = this.config.getOrThrow<string>('APP_URL');

      // ── Create Stripe Checkout Session ───────────────────────────────────
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: buyerEmail, // pre-fills Stripe's email field
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: Math.round(finalPrice * 100),
                product_data: { name: productName },
              },
            },
          ],
          // expires_at defaults to 24 h from now on Stripe's side.
          // checkout.session.expired webhook fires at that point.
          success_url: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/payments/cancel?order_id=${orderId}`,
          metadata: { paymentId: payment.id, orderId, buyerId },
        },
        { idempotencyKey: payment.id },
      );
      console.log(session.payment_intent, 'intent', session.url, 'url');

      await this.paymentsRepo.update(payment.id, {
        gatewayRef: session.payment_intent as string,
        gatewayUrl: session.url ?? undefined,
      });

      paymentUrl = session.url!;
    }

    // ── Email the buyer the payment link ─────────────────────────────────────
    //
    // Fire-and-forget: sendPaymentLink catches its own errors so a mail
    // failure never surfaces here and never rolls back any caller.
    void this.mailService.sendPaymentLink({
      to: buyerEmail,
      productName,
      amount: finalPrice,
      paymentUrl,
      orderId,
    });

    // ── In-app notification ───────────────────────────────────────────────────
    await this.notificationsService.notify(buyerId, {
      type: NotificationType.PAYMENT_REQUIRED,
      title: '',
      body: '',
      titleAr: 'يرجى إتمام الدفع',
      bodyAr: `تم قبول طلبك على "${productName}". أكمل الدفع الآن لتأكيد طلبك.`,
      referenceType: 'order',
      referenceId: orderId,
    });

    this.logger.log(
      `Payment session created for order ${orderId}, buyer ${buyerId}`,
    );
  }

  // ─── Manual initiate (buyer-triggered, existing flow kept as a fallback) ──

  /**
   * Creates (or reuses) a Stripe Checkout Session for the given order.
   * Called explicitly by the buyer if they lose the original link.
   *
   * Idempotency guarantees:
   *  - PAID payment   → throws 400; never re-charge.
   *  - Pending payment with existing session → returns cached URL.
   *  - No payment yet → creates Payment row + fresh Checkout Session.
   */
  async initiatePayment(
    orderId: string,
    buyerId: string,
  ): Promise<{ paymentUrl: string; paymentId: string }> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId, buyerId },
      relations: ['product'],
    });

    if (!order) throw new NotFoundException('Order not found');

    if (
      order.status !== OrderStatus.ACCEPTED &&
      order.status !== OrderStatus.AWAITING_PAYMENT
    ) {
      throw new BadRequestException('Order is not in a payable state');
    }

    let payment = await this.paymentsRepo.findOne({ where: { orderId } });

    if (payment?.status === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    if (payment?.gatewayRef && payment?.gatewayUrl) {
      return { paymentUrl: payment.gatewayUrl, paymentId: payment.id };
    }

    if (!payment) {
      payment = this.paymentsRepo.create({
        orderId,
        buyerId,
        amount: Number(order.finalPrice),
        status: PaymentStatus.PENDING,
        paymentGateway: 'stripe',
      });
      payment = await this.paymentsRepo.save(payment);
    }

    const appUrl = this.config.getOrThrow<string>('APP_URL');

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(Number(order.finalPrice) * 100),
              product_data: {
                name: order.product?.name ?? `Order #${orderId}`,
              },
            },
          },
        ],
        success_url: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/payments/cancel?order_id=${orderId}`,
        metadata: { paymentId: payment.id, orderId, buyerId },
      },
      { idempotencyKey: payment.id },
    );

    await this.paymentsRepo.update(payment.id, {
      gatewayRef: session.payment_intent as string,
      gatewayUrl: session.url ?? undefined,
    });

    return { paymentUrl: session.url!, paymentId: payment.id };
  }

  // ─── Webhook dispatcher ───────────────────────────────────────────────────

  /**
   * Verifies the Stripe-Signature header and dispatches the event.
   *
   * ⚠️  Controller MUST forward the RAW request body (Buffer), not parsed JSON.
   */
  async handleWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<void> {
    const webhookSecret = this.config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    let event: StripeWebhookEvent;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Stripe event: ${event.type} [${event.id}]`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as CheckoutSessionData,
        );
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(
          event.data.object as CheckoutSessionData,
        );
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(
          event.data.object, // as PaymentIntentData,
        );
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ─── Internal: checkout.session.completed ────────────────────────────────

  /**
   * Fired when the buyer successfully completes payment.
   *
   * ## Fixes applied vs original
   * - Order moves to ACCEPTED (was incorrectly set back to PENDING).
   * - DeliveryStatus.PREPARING is set here (merchant cannot ship before payment).
   * - buyerPhoneRevealed is set to true here (only share contact after payment).
   * - walletService.creditPending() is called with the transaction manager so
   *   the wallet update and order update are fully atomic.
   * - creditPending() is NOT called anywhere else — eliminates the double-credit
   *   that existed when acceptOrder/acceptBid also called it.
   */
  private async handleCheckoutCompleted(
    session: CheckoutSessionData,
  ): Promise<void> {
    const paymentId = session.metadata?.paymentId;

    if (!paymentId) {
      this.logger.warn('checkout.session.completed without metadata.paymentId');
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', {
          id: paymentId,
        })
        .getOne();

      if (!payment) {
        this.logger.warn(`Payment ${paymentId} not found`);
        return;
      }

      const order = await manager.findOne(Order, {
        where: { id: payment.orderId },
      });

      if (!order) {
        this.logger.warn(`Order ${payment.orderId} not found`);
        return;
      }

      if (payment.status === PaymentStatus.PAID) {
        this.logger.log(`Payment already processed`);
        return;
      }

      // Save actual PaymentIntent now
      await manager.update(Payment, payment.id, {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        gatewayRef: session.payment_intent ?? undefined,
      });

      await manager.update(Order, order.id, {
        status: OrderStatus.ACCEPTED,
        deliveryStatus: DeliveryStatus.PREPARING,
        buyerPhoneRevealed: true,
      });

      await this.walletService.creditPending(
        order.merchantId,
        Number(order.netAmount),
        order.id,
        manager,
      );

      await this.notificationsService.notify(order.merchantId, {
        type: NotificationType.PAYMENT_RECEIVED,
        titleAr: 'تم استلام الدفعة',
        bodyAr: `تم دفع ${payment.amount} ${payment.currency} للطلب.`,
        title: '',
        body: '',
        referenceType: 'order',
        referenceId: order.id,
      });

      await this.notificationsService.notify(payment.buyerId, {
        type: NotificationType.ORDER_STATUS_CHANGED,
        titleAr: 'تم الدفع بنجاح',
        bodyAr: 'تمت عملية الدفع بنجاح.',
        title: '',
        body: '',
        referenceType: 'order',
        referenceId: order.id,
      });

      this.logger.log(`Order ${order.id} → ACCEPTED`);
    });
  }
  // ─── Internal: checkout.session.expired ──────────────────────────────────

  /**
   * Fired when the Stripe Checkout Session expires (24 h TTL).
   *
   * ## What this does (all new behaviour)
   * 1. Marks the payment FAILED and clears the session reference so a new
   *    session can be issued if needed.
   * 2. Cancels the order (AWAITING_PAYMENT → CANCELLED).
   * 3. For fixed-price orders: restores the product's quantity and reactivates
   *    it if it was marked SOLD_OUT solely because of this order.
   *    Auction products are left SOLD (the auction already resolved).
   * 4. Notifies the buyer.
   */
  private async handleCheckoutExpired(
    session: CheckoutSessionData,
  ): Promise<void> {
    const paymentIntentId = session.payment_intent;
    if (!paymentIntentId) return;

    await this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('p.order', 'order')
        .where('p.gatewayRef = :ref', { ref: paymentIntentId })
        .getOne();

      if (!payment || payment.status === PaymentStatus.PAID) return;

      // ── 1. Fail the payment record ─────────────────────────────────────────
      await manager.update(Payment, payment.id, {
        status: PaymentStatus.FAILED,
        gatewayRef: undefined,
        gatewayUrl: undefined,
      });

      // ── 2. Cancel the order ────────────────────────────────────────────────
      await manager.update(Order, payment.orderId, {
        status: OrderStatus.CANCELLED,
        rejectionReason:
          'تم إلغاء الطلب تلقائياً لعدم إتمام الدفع خلال 24 ساعة',
      });

      // ── 3. Restore stock (fixed-price only) ────────────────────────────────
      //
      // When acceptOrder() ran it decremented product.quantity.  Now that the
      // order is cancelled we must restore those units.
      // Auction products are intentionally left SOLD — reopening a closed
      // auction is out of scope.
      const order = payment.order;
      if (order?.saleMethod === SaleMethod.FIXED && order.productId) {
        const product = await manager.findOne(Product, {
          where: { id: order.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (product) {
          const restoredQty = Number(product.quantity) + Number(order.quantity);
          await manager.update(Product, product.id, {
            quantity: restoredQty,
            // If the product was marked SOLD because this was the last order,
            // re-activate it now that units are back.
            ...(product.status === ProductStatus.SOLD
              ? { status: ProductStatus.ACTIVE }
              : {}),
          });
        }
      }

      // ── 4. Notify buyer ────────────────────────────────────────────────────
      await this.notificationsService.notify(payment.buyerId, {
        type: NotificationType.PAYMENT_FAILED,
        title: '',
        body: '',
        titleAr: 'تم إلغاء طلبك',
        bodyAr:
          'انتهت مهلة الدفع (24 ساعة) وتم إلغاء طلبك تلقائياً. يمكنك تقديم طلب جديد.',
        referenceType: 'order',
        referenceId: payment.orderId,
      });
    });
  }

  // ─── Internal: payment_intent.payment_failed ─────────────────────────────

  /**
   * Fired when a charge attempt is declined (insufficient funds, wrong CVV…).
   * The session itself stays open — the buyer can retry within the 24 h window.
   */
  private async handlePaymentIntentFailed(
    intent: PaymentIntentData,
  ): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { gatewayRef: intent.id },
    });
    if (!payment || payment.status === PaymentStatus.PAID) return;

    await this.paymentsRepo.update(payment.id, {
      status: PaymentStatus.FAILED,
    });

    await this.notificationsService.notify(payment.buyerId, {
      type: NotificationType.PAYMENT_FAILED,
      title: '',
      body: '',
      titleAr: 'فشل الدفع',
      bodyAr: 'لم تتم عملية الدفع. يرجى المحاولة مرة أخرى قبل انتهاء المهلة.',
      referenceType: 'order',
      referenceId: payment.orderId,
    });
  }

  // ─── Cron: cancel orders whose payment window has passed ─────────────────

  /**
   * Belt-and-suspenders job that catches any AWAITING_PAYMENT orders for which
   * Stripe's checkout.session.expired webhook failed to arrive (retries
   * exhausted, network blip, misconfigured endpoint, etc.).
   *
   * Runs every 30 minutes.  Uses a window of PAYMENT_EXPIRY_HOURS (default 25)
   * — one hour beyond Stripe's 24 h session TTL — so the webhook has a chance
   * to fire first and this job only cleans up genuine stragglers.
   *
   * Each order is processed inside its own transaction so a single failure
   * does not block the rest of the batch.
   */
  async cancelUnpaidOrders(): Promise<void> {
    const expiryHours = this.config.get<number>('PAYMENT_EXPIRY_HOURS', 25);
    const cutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000);

    const staleOrders = await this.ordersRepo.find({
      where: {
        status: OrderStatus.AWAITING_PAYMENT,
        createdAt: LessThan(cutoff),
      },
      relations: ['product'],
    });

    if (staleOrders.length === 0) return;

    this.logger.log(
      `cancelUnpaidOrders: processing ${staleOrders.length} stale order(s)`,
    );

    for (const order of staleOrders) {
      try {
        await this.dataSource.transaction(async (manager) => {
          // Re-read with lock to guard against a simultaneous webhook arrival.
          const locked = await manager.findOne(Order, {
            where: { id: order.id },
            lock: { mode: 'pessimistic_write' },
          });

          // Another process already handled this order.
          if (!locked || locked.status !== OrderStatus.AWAITING_PAYMENT) return;

          // ── Cancel order ──────────────────────────────────────────────────
          await manager.update(Order, order.id, {
            status: OrderStatus.CANCELLED,
            rejectionReason:
              'تم إلغاء الطلب تلقائياً لعدم إتمام الدفع خلال المهلة المحددة',
          });

          // ── Fail payment record ───────────────────────────────────────────
          const payment = await manager.findOne(Payment, {
            where: { orderId: order.id },
          });
          if (payment && payment.status !== PaymentStatus.PAID) {
            await manager.update(Payment, payment.id, {
              status: PaymentStatus.FAILED,
              gatewayRef: undefined,
              gatewayUrl: undefined,
            });
          }

          // ── Restore stock for fixed-price orders ──────────────────────────
          if (order.saleMethod === SaleMethod.FIXED && order.productId) {
            const product = await manager.findOne(Product, {
              where: { id: order.productId },
              lock: { mode: 'pessimistic_write' },
            });

            if (product) {
              const restoredQty =
                Number(product.quantity) + Number(order.quantity);
              await manager.update(Product, product.id, {
                quantity: restoredQty,
                ...(product.status === ProductStatus.SOLD ||
                product.status === ProductStatus.EXPIRED ////////321
                  ? { status: ProductStatus.ACTIVE }
                  : {}),
              });
            }
          }

          // ── Notify buyer ──────────────────────────────────────────────────
          await this.notificationsService.notify(order.buyerId, {
            type: NotificationType.PAYMENT_FAILED,
            title: '',
            body: '',
            titleAr: 'تم إلغاء طلبك',
            bodyAr:
              'انتهت مهلة الدفع وتم إلغاء طلبك. يمكنك تقديم طلب جديد في أي وقت.',
            referenceType: 'order',
            referenceId: order.id,
          });
        });

        this.logger.log(`cancelUnpaidOrders: cancelled order ${order.id}`);
      } catch (err) {
        this.logger.error(
          `cancelUnpaidOrders: failed to cancel order ${order.id}: ` +
            (err as Error).message,
        );
      }
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getBuyerPayments(buyerId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { buyerId },
      relations: ['order', 'order.product'],
      order: { createdAt: 'DESC' },
    });
  }

  async getPaymentDetail(
    id: string,
    requestingUserId: string,
  ): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id },
      relations: ['order', 'order.product'],
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (
      payment.buyerId !== requestingUserId &&
      payment.order.merchantId !== requestingUserId
    ) {
      throw new ForbiddenException('Access denied');
    }

    return payment;
  }
}
