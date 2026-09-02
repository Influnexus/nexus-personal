// Provider-agnostic billing interface. Both StripeProvider and RazorpayProvider implement this,
// so BillingService never branches on provider — it just calls the interface. This is what lets
// Phase 4B wire real API calls without touching any business logic written in Phase 4A.
import { PlanId, BillingInterval } from '@/lib/db/models';

export interface CheckoutSessionParams {
  organizationId: string;
  plan: PlanId;
  interval: BillingInterval;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
  provider: 'stripe' | 'razorpay';
  providerSessionId: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'razorpay';
  /** Whether the required API keys are present in the environment. Callers MUST check this before
   *  invoking any other method — Phase 4A intentionally ships with this false until keys are provided. */
  isConfigured(): boolean;
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;
  createCustomerPortalSession(providerCustomerId: string, returnUrl: string): Promise<PortalSessionResult>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured yet. Add the required API keys to enable checkout.`);
  }
}
