export enum EmailTemplate {
  // ── Transactional ──────────────────────
  ORDER_CONFIRMATION = 'order_confirmation',
  PAYMENT_RECEIPT = 'payment_receipt',
  WITHDRAWAL_APPROVED = 'withdrawal_approved',
  PAYMENT_LINK = 'payment_link',

  // ── Auth ───────────────────────────────
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',

  // ── Onboarding ─────────────────────────
  WELCOME = 'welcome',
}
