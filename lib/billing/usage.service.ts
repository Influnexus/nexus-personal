// UsageService — real usage metering (not simulated) + entitlement/feature-gating checks used
// by the "subscription middleware" pattern inside API routes (Next.js edge middleware can't hit
// MongoDB, so gating happens as a helper called at the top of each metered route instead).
import { usageRepo, currentPeriod } from './repo';
import { subscriptionService } from './subscription.service';
import { usageLimitFor } from './plans';
import { UsageMetric } from '@/lib/db/models';

export const usageService = {
  async record(organizationId: string, metric: UsageMetric) {
    await usageRepo.increment(organizationId, metric, currentPeriod());
  },

  async getUsageSummary(organizationId: string) {
    const period = currentPeriod();
    const sub = await subscriptionService.getEffectiveSubscription(organizationId);
    const plan = sub && (sub.status === 'trialing' || sub.status === 'active') ? sub.plan : null;
    const metrics: UsageMetric[] = ['ai_messages', 'invoices_processed', 'csv_imports'];
    const usage = await Promise.all(metrics.map(async m => ({
      metric: m,
      used: await usageRepo.get(organizationId, m, period),
      limit: usageLimitFor(plan, m),
    })));
    return { period, plan, subscriptionStatus: sub?.status || 'none', usage };
  },

  /** Entitlement/gating check — the "subscription middleware" for a specific metered action.
   *  Returns {allowed:true} or {allowed:false, reason} — routes should check this BEFORE doing
   *  the expensive work (LLM call, OCR, etc.) so blocked usage costs nothing. */
  async checkEntitlement(organizationId: string, metric: UsageMetric): Promise<{ allowed: boolean; reason?: string; limit: number; used: number }> {
    const period = currentPeriod();
    const sub = await subscriptionService.getEffectiveSubscription(organizationId);
    const plan = sub && (sub.status === 'trialing' || sub.status === 'active') ? sub.plan : null;
    const limit = usageLimitFor(plan, metric);
    const used = await usageRepo.get(organizationId, metric, period);
    if (used >= limit) {
      const reason = plan
        ? `You've reached your ${plan} plan's monthly limit for this feature. Upgrade for more headroom.`
        : `You've reached the free-tier limit for this feature. Start a free trial to unlock more.`;
      return { allowed: false, reason, limit, used };
    }
    return { allowed: true, limit, used };
  },
};
