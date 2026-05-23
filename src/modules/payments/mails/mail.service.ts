// ─────────────────────────────────────────────────────────────────────────────
// mail.service.ts
//
// Required env variables:
//   MAIL_HOST        smtp.yourprovider.com
//   MAIL_PORT        587
//   MAIL_SECURE      false
//   MAIL_USER        your@email.com
//   MAIL_PASS        your_password
//   MAIL_FROM_NAME   اسم المنصة
//   MAIL_FROM_EMAIL  no-reply@yourapp.com
//
// Install:  npm i nodemailer @types/nodemailer
// Register: add MailService to the providers array of PaymentsModule,
//           OrdersModule, and AuctionsModule (or a shared CoreModule).
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface PaymentLinkEmailOpts {
  to: string;
  buyerName?: string;
  productName: string;
  amount: number;
  currency?: string;
  paymentUrl: string;
  orderId: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT', 587),
      secure: config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    });
  }

  /**
   * Sends the Stripe Checkout URL to the buyer.
   *
   * This is best-effort — a mail failure must never roll back a committed
   * order.  Errors are caught and logged; the in-app push notification is
   * the primary payment-link delivery channel.
   */
  async sendPaymentLink(opts: PaymentLinkEmailOpts): Promise<void> {
    const fromName = this.config.get<string>('MAIL_FROM_NAME', 'المنصة');
    const fromEmail = this.config.get<string>(
      'MAIL_FROM_EMAIL',
      'no-reply@yourapp.com',
    );
    const currency = (opts.currency ?? 'SAR').toUpperCase();

    const html = /* html */ `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>إتمام الدفع</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f5f5f5;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:8px;overflow:hidden;
                            box-shadow:0 2px 8px rgba(0,0,0,0.08);">

                <!-- Header -->
                <tr>
                  <td style="background:#1a73e8;padding:24px 32px;">
                    <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                      ${fromName}
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:32px;">
                    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">
                      مرحباً${opts.buyerName ? ' ' + opts.buyerName : ''}،
                    </h2>
                    <p style="margin:0 0 8px;color:#444;font-size:15px;line-height:1.6;">
                      تم قبول طلبك على:
                    </p>
                    <p style="margin:0 0 24px;color:#1a1a1a;font-size:16px;font-weight:700;">
                      ${opts.productName}
                    </p>

                    <!-- Amount card -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                           style="background:#f0f7ff;border-radius:6px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0;color:#555;font-size:13px;">المبلغ المستحق</p>
                          <p style="margin:4px 0 0;color:#1a73e8;font-size:24px;font-weight:700;">
                            ${opts.amount.toFixed(2)} ${currency}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 24px;color:#d32f2f;font-size:14px;font-weight:600;">
                      ⏳ يرجى إتمام الدفع خلال 24 ساعة — سيتم إلغاء الطلب تلقائياً بعد انتهاء المهلة.
                    </p>

                    <!-- CTA button -->
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                      <tr>
                        <td align="center"
                            style="background:#1a73e8;border-radius:6px;">
                          <a href="${opts.paymentUrl}"
                             style="display:inline-block;padding:14px 36px;
                                    color:#ffffff;font-size:16px;font-weight:700;
                                    text-decoration:none;">
                            ادفع الآن
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0;color:#888;font-size:12px;word-break:break-all;">
                      إذا لم يعمل الزر، انسخ الرابط التالي في متصفحك:<br/>
                      ${opts.paymentUrl}
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eee;">
                    <p style="margin:0;color:#aaa;font-size:11px;text-align:center;">
                      رقم الطلب: ${opts.orderId}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: opts.to,
        subject: `إتمام الدفع لطلبك — ${opts.productName}`,
        html,
      });
      this.logger.log(
        `Payment link email sent to ${opts.to} for order ${opts.orderId}`,
      );
    } catch (err) {
      // Best-effort — log but never rethrow.
      // The in-app push notification is the primary delivery channel.
      this.logger.error(
        `Failed to send payment email to ${opts.to} for order ${opts.orderId}: ` +
          (err as Error).message,
      );
    }
  }
}
