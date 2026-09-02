// Routes to the correct payment provider based on region — India uses Razorpay, everywhere else
// uses Stripe, per product requirements. Enterprise never reaches a provider (Contact Sales).
import { PaymentProvider } from './types';
import { stripeProvider } from './stripe.provider';
import { razorpayProvider } from './razorpay.provider';

export type Region = 'IN' | 'INTL';

export function selectProvider(region: Region): PaymentProvider {
  return region === 'IN' ? razorpayProvider : stripeProvider;
}

export function providerForRegion(region: Region): 'stripe' | 'razorpay' {
  return region === 'IN' ? 'razorpay' : 'stripe';
}
