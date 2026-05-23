export enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  HOLD = 'hold',
  RELEASE = 'release',
}

export enum WalletTransactionReason {
  ORDER_PAYMENT = 'order_payment',
  ORDER_EARNING = 'order_earning',

  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',

  BALANCE_RELEASE = 'balance_release',

  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',

  PLATFORM_FEE = 'platform_fee',

  REFUND = 'refund',

  ADMIN_ADJUSTMENT = 'admin_adjustment',
}
