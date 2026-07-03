// Plan catalog — single source of truth for pricing, limits and features. Never hardcode prices
// elsewhere; always import from here so Stripe/Razorpay price IDs and UI stay in sync.
import { PlanId, UsageMetric } from '@/lib/db/models';

export interface PlanLimits {
  aiMessagesPerMonth: number;
  invoicesPerMonth: number;
  csvImportsPerMonth: number;
  teamMembers: number;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlyUsd: number | null; // null = custom/contact sales
  priceMonthlyInr: number | null;
  yearlyDiscountPct: number; // applied to monthly*12
  limits: PlanLimits;
  features: string[];
  selfServe: boolean; // false = Enterprise, routes to Contact Sales instead of checkout
}

export const FREE_LIMITS: PlanLimits = { aiMessagesPerMonth: 20, invoicesPerMonth: 5, csvImportsPerMonth: 1, teamMembers: 2 };

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For solo founders and small teams getting their financial footing.',
    priceMonthlyUsd: 59,
    priceMonthlyInr: 4999,
    yearlyDiscountPct: 20,
    limits: { aiMessagesPerMonth: 500, invoicesPerMonth: 50, csvImportsPerMonth: 20, teamMembers: 5 },
    features: ['AI CFO chat & briefings', 'Invoice OCR (50/mo)', 'CSV import & categorization', 'Cash flow forecasting', 'Up to 5 team members', 'Email support'],
    selfServe: true,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'For scaling teams that need deeper analysis and more headroom.',
    priceMonthlyUsd: 199,
    priceMonthlyInr: 14999,
    yearlyDiscountPct: 20,
    limits: { aiMessagesPerMonth: 5000, invoicesPerMonth: 500, csvImportsPerMonth: 100, teamMembers: 20 },
    features: ['Everything in Starter', 'Invoice OCR (500/mo)', 'Scenario simulator', 'Executive memory & goal tracking', 'Up to 20 team members', 'Priority support'],
    selfServe: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For organizations needing custom limits, SSO and dedicated support.',
    priceMonthlyUsd: null,
    priceMonthlyInr: null,
    yearlyDiscountPct: 0,
    limits: { aiMessagesPerMonth: Infinity, invoicesPerMonth: Infinity, csvImportsPerMonth: Infinity, teamMembers: Infinity },
    features: ['Everything in Growth', 'Unlimited usage', 'SSO/SAML', 'Dedicated CSM', 'Custom contract & SLA'],
    selfServe: false,
  },
};

export const TRIAL_DAYS = 14;

export function planPrice(plan: PlanId, interval: 'monthly' | 'yearly', currency: 'USD' | 'INR'): number | null {
  const def = PLANS[plan];
  const base = currency === 'USD' ? def.priceMonthlyUsd : def.priceMonthlyInr;
  if (base == null) return null;
  if (interval === 'monthly') return base;
  return Math.round(base * 12 * (1 - def.yearlyDiscountPct / 100));
}

export function usageLimitFor(plan: PlanId | null, metric: UsageMetric): number {
  if (!plan) {
    return metric === 'ai_messages' ? FREE_LIMITS.aiMessagesPerMonth
      : metric === 'invoices_processed' ? FREE_LIMITS.invoicesPerMonth
      : FREE_LIMITS.csvImportsPerMonth;
  }
  const limits = PLANS[plan].limits;
  return metric === 'ai_messages' ? limits.aiMessagesPerMonth
    : metric === 'invoices_processed' ? limits.invoicesPerMonth
    : limits.csvImportsPerMonth;
}
