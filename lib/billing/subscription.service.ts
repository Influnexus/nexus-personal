// SubscriptionService — trial lifecycle, plan changes, cancellation. Provider-agnostic: never
// branches on provider name; delegates to lib/billing/providers/router.ts + PaymentProvider.
import { subscriptionsRepo } from './repo';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { PlanId, BillingInterval, SubscriptionDoc } from '@/lib/db/models';
import { TRIAL_DAYS, PLANS } from './plans';
import { Region } from './providers/router';

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export const subscriptionService = {
  async getSubscription(organizationId: string) {
    return subscriptionsRepo.findByOrg(organizationId);
  },

  /** Resolves the *effective* status, flipping an expired trial in-place. Call this before any
   *  entitlement check so trial expiry is always accurate even if no background job runs. */
  async getEffectiveSubscription(organizationId: string): Promise<SubscriptionDoc | null> {
    const sub = await subscriptionsRepo.findByOrg(organizationId);
    if (!sub) return null;
    if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt < new Date()) {
      return subscriptionsRepo.update(organizationId, { status: 'trial_expired' });
    }
    return sub;
  },

  /** Starts a 14-day trial. No payment is collected — this is genuinely free, not simulated. */
  async startTrial(organizationId: string, userId: string, plan: PlanId, interval: BillingInterval, region: Region) {
    const existing = await subscriptionsRepo.findByOrg(organizationId);
    if (existing) throw new Error('This organization already has a subscription. Use upgrade/downgrade instead.');
    if (!PLANS[plan].selfServe) throw new Error('Enterprise plans require Contact Sales — trials are not available for this plan.');
    const now = new Date();
    const sub = await subscriptionsRepo.create({
      organizationId, plan, interval, status: 'trialing', provider: null,
      trialStartedAt: now, trialEndsAt: addDays(now, TRIAL_DAYS),
      currentPeriodStart: now, currentPeriodEnd: addDays(now, TRIAL_DAYS),
      cancelAtPeriodEnd: false, canceledAt: null, region,
    });
    await auditRepo.log({ userId, organizationId, action: 'billing.trial_started', metadata: { plan, interval } });
    return sub;
  },

  /** Change plan/interval. During trial or before any real payment exists, this is a free
   *  metadata change (no fake charge implied). Once a real provider subscription exists
   *  (Phase 4B), this will route through the provider's update-subscription API instead. */
  async changePlan(organizationId: string, userId: string, plan: PlanId, interval: BillingInterval) {
    const sub = await subscriptionsRepo.findByOrg(organizationId);
    if (!sub) throw new Error('No subscription found — start a trial first.');
    if (!PLANS[plan].selfServe) throw new Error('Enterprise requires Contact Sales.');
    if (sub.provider && sub.providerSubscriptionId) {
      // Phase 4B: real paid subscription exists — plan changes must go through the provider so
      // proration/billing is correct. Until keys are configured this path cannot be reached because
      // no checkout can complete, but we fail loudly rather than silently faking an upgrade.
      throw new Error('This organization has a live subscription — plan changes require completing checkout with the payment provider.');
    }
    const updated = await subscriptionsRepo.update(organizationId, { plan, interval });
    await auditRepo.log({ userId, organizationId, action: 'billing.plan_changed', metadata: { plan, interval } });
    return updated;
  },

  async cancel(organizationId: string, userId: string, immediate = false) {
    const sub = await subscriptionsRepo.findByOrg(organizationId);
    if (!sub) throw new Error('No subscription found.');
    const patch = immediate
      ? { status: 'canceled' as const, canceledAt: new Date(), cancelAtPeriodEnd: false }
      : { cancelAtPeriodEnd: true };
    const updated = await subscriptionsRepo.update(organizationId, patch);
    await auditRepo.log({ userId, organizationId, action: 'billing.canceled', metadata: { immediate } });
    return updated;
  },

  async resume(organizationId: string, userId: string) {
    const sub = await subscriptionsRepo.findByOrg(organizationId);
    if (!sub) throw new Error('No subscription found.');
    const updated = await subscriptionsRepo.update(organizationId, { cancelAtPeriodEnd: false, status: sub.status === 'canceled' ? 'trialing' : sub.status });
    await auditRepo.log({ userId, organizationId, action: 'billing.resumed' });
    return updated;
  },
};
