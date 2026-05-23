import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

/** Injection token used to inject the Stripe SDK instance. */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const StripeProvider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe.Stripe => {
    const secretKey = config.getOrThrow<string>('STRIPE_SECRET_KEY');
    return new Stripe(secretKey, {
      apiVersion: '2026-04-22.dahlia',
    });
  },
};
