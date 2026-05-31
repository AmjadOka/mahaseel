import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EmailTemplate } from 'src/common/enums/email.enum';

export interface MailPayload {
  to: string;
  template: EmailTemplate;
  subject: string;
  context: Record<string, any>;
}

/* =====================================================
    LAYOUTS
===================================================== */

function layoutRtl(accentColor: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    </head>
    <body style="margin:0;padding:0;background:#f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f4f4f4;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0"
                   style="background:#ffffff;border-radius:10px;overflow:hidden;
                          box-shadow:0 2px 12px rgba(0,0,0,0.08);
                          font-family:Arial,Helvetica,sans-serif;
                          direction:rtl;text-align:right;">

              <!-- Header -->
              <tr>
                <td style="background:${accentColor};padding:22px 32px;">
                  <p style="margin:0;color:#fff;font-size:22px;font-weight:700;
                            letter-spacing:.5px;">
                    محصول 🌾
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px 32px 24px;">
                  ${body}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#fafafa;border-top:1px solid #eee;
                           padding:16px 32px;text-align:center;">
                  <p style="margin:0;color:#bbb;font-size:11px;line-height:1.6;">
                    © ${new Date().getFullYear()} محصول. جميع الحقوق محفوظة.<br/>
                    تلقّيت هذا البريد لأنك مسجّل في منصة محصول.
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
}

/* ── Divider ──────────────────────────────────────── */
const divider = `<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>`;

/* ── Info row inside a card ───────────────────────── */
function infoCard(
  rows: { label: string; value: string }[],
  color: string,
): string {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
          <span style="color:#888;font-size:13px;">${r.label}</span><br/>
          <span style="color:#1a1a1a;font-size:15px;font-weight:600;">${r.value}</span>
        </td>
      </tr>`,
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9f9f9;border-radius:8px;
                  border-right:4px solid ${color};
                  padding:4px 0;margin:20px 0;">
      <tr><td style="padding:4px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${rowsHtml}
        </table>
      </td></tr>
    </table>`;
}

/* ── CTA button ───────────────────────────────────── */
function ctaButton(label: string, url: string, color: string): string {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background:${color};border-radius:7px;">
          <a href="${url}"
             style="display:inline-block;padding:13px 36px;color:#fff;
                    font-size:15px;font-weight:700;text-decoration:none;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

/* ── OTP code block ───────────────────────────────── */
function otpBlock(code: string, color: string): string {
  return `
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;padding:16px 40px;
                  background:${color}12;border:2px solid ${color};
                  border-radius:10px;font-size:36px;font-weight:700;
                  letter-spacing:12px;color:${color};">
        ${code}
      </div>
    </div>`;
}

/* ── Greeting ─────────────────────────────────────── */
function greeting(name?: string): string {
  return `<p style="margin:0 0 20px;font-size:16px;color:#333;">
    مرحباً${name ? ` <strong>${name}</strong>` : ''}،
  </p>`;
}

/* ── Note box ─────────────────────────────────────── */
function noteBox(text: string, color: string): string {
  return `
    <div style="background:${color}0f;border-radius:6px;
                padding:12px 16px;margin:20px 0;
                border-right:3px solid ${color};">
      <p style="margin:0;font-size:13px;color:#555;line-height:1.7;">${text}</p>
    </div>`;
}

/* =====================================================
    TEMPLATE BUILDERS
===================================================== */

const TEMPLATE_BUILDERS: Record<
  EmailTemplate,
  (ctx: Record<string, any>) => string
> = {
  /* ─────────────────────────────────────────────────
      ORDER_CONFIRMATION
      ctx: { name?, orderId, productName, quantity,
             unit, total, deliveryMethod }
  ───────────────────────────────────────────────── */
  [EmailTemplate.ORDER_CONFIRMATION]: (ctx) =>
    layoutRtl(
      '#2e7d32',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 6px;font-size:15px;color:#444;line-height:1.7;">
        تم استلام طلبك بنجاح وهو الآن قيد المراجعة من قِبل التاجر.
        سيتم إشعارك فور الموافقة عليه.
      </p>

      ${infoCard(
        [
          { label: 'رقم الطلب', value: `#${ctx.orderId}` },
          { label: 'المنتج', value: ctx.productName ?? '—' },
          {
            label: 'الكمية',
            value: `${ctx.quantity ?? '—'} ${ctx.unit ?? ''}`,
          },
          { label: 'طريقة التوصيل', value: ctx.deliveryMethod ?? '—' },
          { label: 'المبلغ الإجمالي', value: ctx.total ?? '—' },
        ],
        '#2e7d32',
      )}

      ${noteBox('إذا لم تتلقَّ ردًا خلال 24 ساعة، يمكنك التواصل مع الدعم من داخل التطبيق.', '#2e7d32')}
    `,
    ),

  /* ─────────────────────────────────────────────────
      PAYMENT_RECEIPT
      ctx: { name?, orderId, amount, currency?,
             paymentMethod?, paidAt? }
  ───────────────────────────────────────────────── */
  [EmailTemplate.PAYMENT_RECEIPT]: (ctx) =>
    layoutRtl(
      '#1565c0',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 6px;font-size:15px;color:#444;line-height:1.7;">
        تم استلام دفعتك بنجاح. فيما يلي تفاصيل العملية للاحتفاظ بها كمرجع.
      </p>

      ${infoCard(
        [
          { label: 'رقم الطلب', value: `#${ctx.orderId}` },
          {
            label: 'المبلغ المدفوع',
            value: `${Number(ctx.amount).toFixed(2)} ${(ctx.currency ?? 'SAR').toUpperCase()}`,
          },
          {
            label: 'طريقة الدفع',
            value: ctx.paymentMethod ?? 'بطاقة ائتمانية',
          },
          {
            label: 'تاريخ الدفع',
            value: ctx.paidAt
              ? new Date(ctx.paidAt).toLocaleDateString('ar-SA')
              : new Date().toLocaleDateString('ar-SA'),
          },
        ],
        '#1565c0',
      )}

      ${noteBox('إذا لم تُجرِ هذه العملية، يُرجى التواصل مع الدعم فورًا.', '#d32f2f')}
    `,
    ),

  /* ─────────────────────────────────────────────────
      WITHDRAWAL_APPROVED
      ctx: { name?, amount, currency?,
             bankName?, last4?, processedAt? }
  ───────────────────────────────────────────────── */
  [EmailTemplate.WITHDRAWAL_APPROVED]: (ctx) =>
    layoutRtl(
      '#6a1b9a',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 6px;font-size:15px;color:#444;line-height:1.7;">
        تمت الموافقة على طلب السحب وجارٍ تحويل المبلغ إلى حسابك البنكي.
        قد يستغرق الأمر من يوم إلى ثلاثة أيام عمل حسب البنك.
      </p>

      ${infoCard(
        [
          {
            label: 'المبلغ المحوَّل',
            value: `${Number(ctx.amount).toFixed(2)} ${(ctx.currency ?? 'SAR').toUpperCase()}`,
          },
          { label: 'البنك', value: ctx.bankName ?? '—' },
          { label: 'رقم الحساب', value: ctx.last4 ? `•••• ${ctx.last4}` : '—' },
          {
            label: 'تاريخ المعالجة',
            value: ctx.processedAt
              ? new Date(ctx.processedAt).toLocaleDateString('ar-SA')
              : new Date().toLocaleDateString('ar-SA'),
          },
        ],
        '#6a1b9a',
      )}

      ${noteBox('في حال عدم وصول المبلغ خلال 3 أيام عمل، يُرجى التواصل مع الدعم.', '#6a1b9a')}
    `,
    ),

  /* ─────────────────────────────────────────────────
      PAYMENT_LINK
      ctx: { buyerName?, productName, amount,
             currency?, paymentUrl, orderId }
  ───────────────────────────────────────────────── */
  [EmailTemplate.PAYMENT_LINK]: (ctx) =>
    layoutRtl(
      '#1a73e8',
      `
      ${greeting(ctx.buyerName)}

      <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">
        تمت الموافقة على طلبك. يُرجى إتمام الدفع لتأكيد الطلب وبدء التجهيز.
      </p>

      ${infoCard(
        [
          { label: 'المنتج', value: ctx.productName },
          {
            label: 'المبلغ المستحق',
            value: `${Number(ctx.amount).toFixed(2)} ${(ctx.currency ?? 'SAR').toUpperCase()}`,
          },
          { label: 'رقم الطلب', value: `#${ctx.orderId}` },
        ],
        '#1a73e8',
      )}

      ${noteBox('⏳ المهلة 24 ساعة — سيتم إلغاء الطلب تلقائيًا بعد انتهاء المهلة.', '#d32f2f')}

      ${ctaButton('ادفع الآن', ctx.paymentUrl, '#1a73e8')}

      <p style="color:#aaa;font-size:12px;line-height:1.6;margin:0;word-break:break-all;">
        إذا لم يعمل الزر، انسخ الرابط التالي في متصفحك:<br/>
        <span style="color:#1a73e8;">${ctx.paymentUrl}</span>
      </p>
    `,
    ),

  /* ─────────────────────────────────────────────────
      EMAIL_VERIFICATION
      ctx: { code, name? }
  ───────────────────────────────────────────────── */
  [EmailTemplate.EMAIL_VERIFICATION]: (ctx) =>
    layoutRtl(
      '#2e7d32',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 6px;font-size:15px;color:#444;line-height:1.7;">
        أدخل الرمز أدناه في التطبيق لتفعيل حسابك في محصول.
        صلاحية الرمز <strong>10 دقائق</strong> فقط.
      </p>

      ${otpBlock(ctx.code, '#2e7d32')}

      ${divider}

      ${noteBox('إذا لم تُنشئ هذا الحساب، تجاهل هذا البريد ولا داعي للقلق.', '#888')}
    `,
    ),

  /* ─────────────────────────────────────────────────
      PASSWORD_RESET
      ctx: { code, name? }
  ───────────────────────────────────────────────── */
  [EmailTemplate.PASSWORD_RESET]: (ctx) =>
    layoutRtl(
      '#e65100',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 6px;font-size:15px;color:#444;line-height:1.7;">
        تلقّينا طلبًا لإعادة تعيين كلمة مرور حسابك.
        استخدم الرمز أدناه لإتمام العملية.
        صلاحية الرمز <strong>10 دقائق</strong>.
      </p>

      ${otpBlock(ctx.code, '#e65100')}

      ${divider}

      ${noteBox('إذا لم تطلب إعادة تعيين كلمة المرور، يُرجى تأمين حسابك فورًا والتواصل مع الدعم.', '#d32f2f')}
    `,
    ),

  /* ─────────────────────────────────────────────────
      WELCOME
      ctx: { name?, appUrl?, supportEmail? }
  ───────────────────────────────────────────────── */
  [EmailTemplate.WELCOME]: (ctx) =>
    layoutRtl(
      '#2e7d32',
      `
      ${greeting(ctx.name)}

      <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">
        يسعدنا انضمامك إلى منصة <strong>محصول</strong> —
        المنصة التي تربطك مباشرةً بالمزارعين المحليين.
        منتجات طازجة، أسعار عادلة، مباشرةً من المزرعة إلى يدك.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f6fdf6;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-weight:700;color:#2e7d32;font-size:13px;
                      text-transform:uppercase;letter-spacing:.5px;">
              ماذا يمكنك فعله الآن
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="padding:6px 0;font-size:14px;color:#333;">🛒 &nbsp;تصفّح المنتجات الطازجة الموسمية</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#333;">🏷️ &nbsp;اطلب بسعر ثابت أو شارك في المزادات</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#333;">🚜 &nbsp;تواصل مباشرةً مع التجار الموثّقين</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#333;">⭐ &nbsp;قيّم تجربتك بعد كل طلب</td></tr>
            </table>
          </td>
        </tr>
      </table>

      ${ctaButton('ابدأ التسوق الآن', ctx.appUrl ?? '#', '#2e7d32')}

      ${divider}

      <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">
        هل لديك استفسار؟ راسلنا على
        <a href="mailto:${ctx.supportEmail ?? 'support@mahaseel.com'}"
           style="color:#2e7d32;font-weight:600;">
          ${ctx.supportEmail ?? 'support@mahaseel.com'}
        </a>
        وسيكون فريقنا بخدمتك.
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
      host: 'smtp.gmail.com',
      port: 587,
      auth: {
        user: this.config.getOrThrow('MAIL_USER'),
        pass: this.config.getOrThrow('MAIL_PASS'),
      },
      family: 4,
    } as any);
  }

  async send(payload: MailPayload): Promise<void> {
    const builder = TEMPLATE_BUILDERS[payload.template];
    const html = builder(payload.context);

    const from = `"${this.config.get('MAIL_FROM_NAME', 'Mahaseel')}" <${this.config.getOrThrow('MAIL_FROM_ADDRESS')}>`;

    try {
      const info = await this.transporter.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        html,
      });

      this.logger.log(
        `Email sent [${payload.template}] → ${payload.to} | ${info.messageId}`,
      );
    } catch (err) {
      this.logger.error(
        `Email failed [${payload.template}] → ${payload.to}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
