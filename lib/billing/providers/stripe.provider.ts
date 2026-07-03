// StripeProvider — implements the PaymentProvider interface. Lazily initializes the Stripe SDK
// only when STRIPE_SECRET_KEY is present, so this module can be imported safely even with no
// keys configured (Phase 4A). Phase 4B just needs to set the env vars below; no code changes.
//
// Required env vars (see .env):
//   STRIPE_SECRET_KEY            (server) sk_test_... / sk_live_...
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (client) pk_test_... / pk_live_...
//   STRIPE_WEBHOOK_SECRET         (server) whsec_...
import Stripe from 'stripe';
import { PaymentProvider, CheckoutSessionParams, CheckoutSessionResult, PortalSessionResult, ProviderNotConfiguredError } from './types';
import { PLANS } from '@/lib/billing/plans';

let client: Stripe | null = null;
function getClient(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ProviderNotConfiguredError('Stripe');
  client = new Stripe(key);
  return client;
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  isConfigured() {
    return !!process.env.STRIPE_SECRET_KEY;
  },

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const stripe = getClient();
    const def = PLANS[params.plan];
    // NOTE (Phase 4B TODO): once real Stripe Price IDs exist for each plan/interval, reference
    // them via env vars (e.g. STRIPE_PRICE_STARTER_MONTHLY) instead of inline price_data.
    const unitAmount = Math.round((def.priceMonthlyUsd || 0) * 100 * (params.interval === 'yearly' ? 12 * (1 - def.yearlyDiscountPct / 100) : 1));
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `NexusAI ${def.name} (${params.interval})` },
          recurring: { interval: params.interval === 'yearly' ? 'year' : 'month' },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      subscription_data: { trial_period_days: undefined },
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { organizationId: params.organizationId, plan: params.plan, interval: params.interval },
    });
    return { url: session.url!, provider: 'stripe', providerSessionId: session.id };
  },

  async createCustomerPortalSession(providerCustomerId: string, returnUrl: string): Promise<PortalSessionResult> {
    const stripe = getClient();
    const session = await stripe.billingPortal.sessions.create({ customer: providerCustomerId, return_url: returnUrl });
    return { url: session.url };
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const stripe = getClient();
    await stripe.subscriptions.cancel(providerSubscriptionId);
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    try {
      getClient().webhooks.constructEvent(rawBody, signatureHeader, secret);
      return true;
    } catch {
      return false;
    }
  },
};
