export enum OrderStatus {
  PENDING = 'PENDING',

  /**
   * Merchant accepted.  A Stripe Checkout Session has been created and the
   * payment link sent to the buyer.  The order will automatically rollback
   * to CANCELLED if the buyer does not pay within 24 h.
   */
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',

  /**
   * Stripe confirmed payment (checkout.session.completed webhook fired).
   * Merchant's pending wallet balance has been credited.
   * Delivery workflow may now begin.
   */
  ACCEPTED = 'ACCEPTED',

  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  REFUNDED = 'REFUNDED',
}

export enum DeliveryStatus {
  PREPARING = 'PREPARING',
  READY_PICKUP = 'READY_PICKUP',
  IN_DELIVERY = 'IN_DELIVERY',
  DELIVERED = 'DELIVERED',
}
