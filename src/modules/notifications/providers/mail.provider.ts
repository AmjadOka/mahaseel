import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailTemplate } from '../../../common/enums/email.enum';

export interface MailPayload {
  to: string;
  template: EmailTemplate;
  subject: string;
  context: Record<string, any>;
}

/** Map each template to its HTML builder. Add real templates / Handlebars as needed. */
const TEMPLATE_BUILDERS: Record<
  EmailTemplate,
  (ctx: Record<string, any>) => string
> = {
  [EmailTemplate.ORDER_CONFIRMATION]: (ctx) => `
    <h2>Order Confirmed</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>Your order <strong>#${ctx.orderId}</strong> has been confirmed.</p>
    <p>Total: <strong>${ctx.total}</strong></p>
  `,
  [EmailTemplate.PAYMENT_RECEIPT]: (ctx) => `
    <h2>Payment Receipt</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>We received your payment of <strong>${ctx.amount}</strong> for order <strong>#${ctx.orderId}</strong>.</p>
  `,
  [EmailTemplate.WITHDRAWAL_APPROVED]: (ctx) => `
    <h2>Withdrawal Approved</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>Your withdrawal request of <strong>${ctx.amount}</strong> has been approved and is being processed.</p>
  `,
};

@Injectable()
export class MailProvider {
  private readonly logger = new Logger(MailProvider.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT', 587),
      secure: this.config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.config.getOrThrow<string>('MAIL_USER'),
        pass: this.config.getOrThrow<string>('MAIL_PASS'),
      },
    });
  }

  async send(payload: MailPayload): Promise<void> {
    const html = TEMPLATE_BUILDERS[payload.template](payload.context);

    try {
      await this.transporter.sendMail({
        from: `"${this.config.get('MAIL_FROM_NAME', 'Platform')}" <${this.config.get('MAIL_FROM_ADDRESS')}>`,
        to: payload.to,
        subject: payload.subject,
        html,
      });
      this.logger.log(`Email sent [${payload.template}] → ${payload.to}`);
    } catch (err) {
      this.logger.error(
        `Email failed [${payload.template}] → ${payload.to}`,
        err,
      );
      throw err;
    }
  }
}
