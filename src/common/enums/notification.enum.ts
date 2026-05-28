export enum NotificationType {
  // Orders
  ORDER_PLACED = 'order_placed',
  ORDER_ACCEPTED = 'order_accepted',
  ORDER_REJECTED = 'order_rejected',
  ORDER_STATUS_CHANGED = 'order_status_changed',
  ORDER_COMPLETED = 'order_completed',
  ORDER_CANCELLED = 'order_cancelled',
  // Auctions
  BID_PLACED = 'bid_placed',
  AUCTION_STARTED = 'auction_started',
  AUCTION_ENDED = 'auction_ended',
  AUCTION_WON = 'auction_won',
  AUCTION_LOST = 'auction_lost',

  // Payments
  PAYMENT_REQUIRED = 'payment_required',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_ISSUED = 'refund_issued',

  // Withdrawals
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',

  // Farms
  FARM_APPROVED = 'farm_approved',
  FARM_REJECTED = 'farm_rejected',
  FARM_UPDATED = 'farm_updated',
  FARM_PENDING = 'farm_pending',
  FARM_SUSPENDED = 'farm_suspended',
  FARM_DELETED = 'farm_deleted',

  // Reviews
  RATING_RECEIVED = 'rating_received',

  // System
  SYSTEM = 'system',

  //products
  PRODUCT_DEACTIVATED = 'product_deactivated',
  PRODUCT_REACTIVATED = 'product_reactivated',
  //user
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_REINSTATED = 'account_reinstated',

  ACCOUNT_PROMOTING_PENDING = 'account_promoting_pending',
  ACCOUNT_PROMOTED = 'account_promoted',
  ACCOUNT_REJECT_PROMOTING = 'account_reject_promoting',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}
