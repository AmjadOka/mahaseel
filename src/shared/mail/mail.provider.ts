import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailTemplate } from 'src/common/enums/email.enum';

export interface MailPayload {
  to: string;
  template: EmailTemplate;
  subject: string;
  context: Record<string, any>;
}

/* =====================================================
    SHARED LAYOUT
    Wrap every template in a consistent branded shell.
===================================================== */

function layout(accentColor: string, body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      <div style="background:${accentColor};padding:20px 32px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;color:#fff;">Mahaseel 🌾</h1>
      </div>
      <div style="padding:28px 32px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;">
        ${body}
      </div>
      <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">
        © ${new Date().getFullYear()} Mahaseel. All rights reserved.
      </p>
    </div>
  `;
}

function codeBlock(code: string, color: string): string {
  return `
    <div style="
      display:inline-block;
      padding:14px 36px;
      background:${color}18;
      border:2px solid ${color};
      border-radius:8px;
      font-size:34px;
      font-weight:bold;
      letter-spacing:10px;
      color:${color};
      margin:20px 0;
    ">${code}</div>
  `;
}

/* =====================================================
    TEMPLATE BUILDERS
    Each function receives the `context` passed by the caller
    and returns an HTML string.
===================================================== */

const TEMPLATE_BUILDERS: Record<
  EmailTemplate,
  (ctx: Record<string, any>) => string
> = {
  /* ── Transactional ─────────────────────────────── */

  [EmailTemplate.ORDER_CONFIRMATION]: (ctx) =>
    layout(
      '#2e7d32',
      `
    <h2 style="margin-top:0;">Order Confirmed ✅</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>Your order <strong>#${ctx.orderId}</strong> has been confirmed.</p>
    <p>Total: <strong>${ctx.total}</strong></p>
  `,
    ),

  [EmailTemplate.PAYMENT_RECEIPT]: (ctx) =>
    layout(
      '#1565c0',
      `
    <h2 style="margin-top:0;">Payment Receipt 🧾</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>We received your payment of <strong>${ctx.amount}</strong>
       for order <strong>#${ctx.orderId}</strong>.</p>
  `,
    ),

  [EmailTemplate.WITHDRAWAL_APPROVED]: (ctx) =>
    layout(
      '#6a1b9a',
      `
    <h2 style="margin-top:0;">Withdrawal Approved 💸</h2>
    <p>Hello ${ctx.name ?? 'Customer'},</p>
    <p>Your withdrawal of <strong>${ctx.amount}</strong>
       has been approved and is being processed.</p>
  `,
    ),

  /* ── Auth ───────────────────────────────────────── */

  /**
   * ctx: { code: string, name?: string }
   */
  [EmailTemplate.EMAIL_VERIFICATION]: (ctx) =>
    layout(
      '#2e7d32',
      `
    <h2 style="margin-top:0;">Activate your account</h2>
    <p>Hi ${ctx.name ?? 'there'},</p>
    <p>Enter the code below in the app to activate your Mahaseel account.
       It expires in <strong>10 minutes</strong>.</p>
    ${codeBlock(ctx.code, '#2e7d32')}
    <p style="color:#777;font-size:13px;">
      If you did not create an account, you can safely ignore this email.
    </p>
  `,
    ),

  /**
   * ctx: { code: string }
   */
  [EmailTemplate.PASSWORD_RESET]: (ctx) =>
    layout(
      '#e65100',
      `
    <h2 style="margin-top:0;">Password Reset</h2>
    <p>Use the code below to reset your Mahaseel password.
       It expires in <strong>10 minutes</strong>.</p>
    ${codeBlock(ctx.code, '#e65100')}
    <p style="color:#777;font-size:13px;">
      If you did not request a password reset, please secure your account immediately.
    </p>
  `,
    ),
};

/* =====================================================
    PROVIDER
===================================================== */

@Injectable()
export class MailProvider {
  private readonly logger = new Logger(MailProvider.name);
  private readonly transporter: nodemailer.Transporter;

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
        from: `"${this.config.get('MAIL_FROM_NAME', 'Mahaseel')}" <${this.config.getOrThrow('MAIL_FROM_ADDRESS')}>`,
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
