// RazorpayProvider — implements the PaymentProvider interface for India. Lazily initializes the
// Razorpay SDK only when keys are present, so this module is safe to import with no keys
// configured (Phase 4A). Phase 4B just needs to set the env vars below; no code changes.
//
// Required env vars (see .env):
//   RAZORPAY_KEY_ID               (server + NEXT_PUBLIC_RAZORPAY_KEY_ID for client checkout)
//   RAZORPAY_KEY_SECRET            (server)
//   RAZORPAY_WEBHOOK_SECRET         (server)
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentProvider, CheckoutSessionParams, CheckoutSessionResult, PortalSessionResult, ProviderNotConfiguredError } from './types';
import { PLANS } from '@/lib/billing/plans';

let client: Razorpay | null = null;
function getClient(): Razorpay {
  if (client) return client;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new ProviderNotConfiguredError('Razorpay');
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

export const razorpayProvider: PaymentProvider = {
  name: 'razorpay',

  isConfigured() {
    return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  },

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const rzp = getClient();
    const def = PLANS[params.plan];
    const amountPaise = Math.round((def.priceMonthlyInr || 0) * 100 * (params.interval === 'yearly' ? 12 * (1 - def.yearlyDiscountPct / 100) : 1));
    // NOTE (Phase 4B TODO): Razorpay subscriptions require a Plan to exist first (plans.create),
    // then a Subscription bound to it, then the browser opens Razorpay Checkout with that
    // subscription_id (see RazorpayCheckoutButton). We create the plan+subscription eagerly here
    // and return a URL to our own /billing/checkout/razorpay page which mounts the checkout script
    // with the subscription id (Razorpay has no hosted-redirect checkout URL like Stripe).
    const plan = await rzp.plans.create({
      period: params.interval === 'yearly' ? 'yearly' : 'monthly',
      interval: 1,
      item: { name: `NexusAI ${def.name} (${params.interval})`, amount: amountPaise, currency: 'INR' },
    } as any);
    const subscription = await rzp.subscriptions.create({
      plan_id: (plan as any).id,
      total_count: params.interval === 'yearly' ? 5 : 60,
      customer_notify: 1 as any,
      notes: { organizationId: params.organizationId, plan: params.plan, interval: params.interval },
    } as any);
    const checkoutUrl = `${params.successUrl.split('?')[0].replace(/\/billing.*/, '')}/billing/checkout/razorpay?subscription_id=${(subscription as any).id}`;
    return { url: checkoutUrl, provider: 'razorpay', providerSessionId: (subscription as any).id };
  },

  async createCustomerPortalSession(_providerCustomerId: string, returnUrl: string): Promise<PortalSessionResult> {
    // Razorpay has no hosted customer portal equivalent to Stripe's — self-service is handled
    // in-app (our own Billing page) backed by the Razorpay Subscriptions API.
    return { url: returnUrl };
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const rzp = getClient();
    await rzp.subscriptions.cancel(providerSubscriptionId);
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return digest === signatureHeader;
  },
};
