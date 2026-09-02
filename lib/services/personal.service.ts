// Nexus Personal service — org-scoped wrapper over the shared deterministic core.
// SINGLE SOURCE OF TRUTH = org.personalProfile. Headline monthly figures (income, essential,
// discretionary, surplus, savings rate, cash) come DIRECTLY from the profile. The tested forecast/
// resilience engine is fed an IN-MEMORY (never persisted) history derived from the profile when the
// user has no real transactions. Transaction ANALYTICS (spending breakdown, "what changed",
// anomalies) render ONLY from REAL imported transactions — never fabricated. Demo workspaces keep
// their isolated seeded data. ALL math lives in the pure core.
import { transactionsRepo } from '@/lib/repositories/transactions';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { orgsRepo } from '@/lib/repositories/organizations';
import {
  computePersonalState, computePersonalStateFromProfile, computePersonalHealth,
  computePersonalResilience, computeWhatChanged, forecastCash, computeAnomalies,
  computePersonalAlerts, getTopAlerts, computeFinancialFreedom,
  PersonalState, PersonalHealth, PersonalResilience, PersonalChange,
  ForecastResult, PersonalAlert, FinancialFreedomResult,
} from '@/lib/core/finance';
import type { TransactionLike } from '@/lib/core/finance';
import { generatePersonalTransactions } from '@/lib/services/personal-seed.service';
import { OrganizationDoc, PersonalProfile } from '@/lib/db/models';

// Transaction sources that are NOT real user data (must be excluded from analytics for real users).
const SEED_SOURCES = new Set(['onboarding_seed', 'demo_seed']);

export interface PersonalOverview {
  workspace: { id: string; name: string; isDemo: boolean };
  currency: string;
  state: PersonalState;
  health: PersonalHealth;
  resilience: PersonalResilience;
  changes: PersonalChange[];
  alerts: PersonalAlert[];
  position: { cash: number; investments: number; totalDebt: number; netWorth: number };
  goal: string | null;
  hasProfile: boolean;
  hasTransactions: boolean;    // real imported transactions exist
}

export interface ForecastDriverSummary { label: string; kind: string; monthlyAmount: number; direction: 'inflow' | 'outflow' }

export interface ForecastSensitivity { key: string; label: string; monthlySurplus: number; day90: number }
export interface PersonalForecastResponse {
  forecast: ForecastResult;
  currency: string;
  resilience: PersonalResilience;
  drivers: ForecastDriverSummary[];
  explanation: string;
  knownCount: number;
  projectedCount: number;
  // Profile-grounded projections (work even with zero transactions)
  metrics: { monthlyIncome: number; monthlyExpenses: number; monthlySurplus: number; savingsRate: number; currentCash: number };
  projections: { startingCash: number; day30: number; day60: number; day90: number };
  sensitivities: ForecastSensitivity[];
  assumptions: string[];
  hasProfile: boolean;
  hasTransactions: boolean;
}

export interface PersonalAlertsResponse {
  alerts: PersonalAlert[];
  currency: string;
  summary: { critical: number; warning: number; info: number; total: number };
}

export interface FinancialFreedomResponse {
  freedom: FinancialFreedomResult;
  currency: string;
  hasProfile: boolean;
}

interface CanonicalBase {
  profile?: PersonalProfile;
  currency: string;
  isDemo: boolean;
  allTxs: TransactionLike[];
  realTxs: TransactionLike[];      // real imported transactions only (analytics)
  baseTxs: TransactionLike[];      // history feeding the forecast/resilience engine
  state: PersonalState;            // canonical headline state
  hasProfile: boolean;
  hasTransactions: boolean;
}

async function resolveBase(org: OrganizationDoc): Promise<CanonicalBase> {
  const allTxs = (await transactionsRepo.listByOrg(org.id)) as unknown as TransactionLike[];
  const profile = org.personalProfile;
  const isDemo = !!org.isDemo;
  const currency = profile?.currency || allTxs[0]?.currency || 'INR';

  // Real (user) transactions: for demo workspaces the seeded data IS the intended dataset.
  const realTxs = isDemo ? allTxs : allTxs.filter(t => !SEED_SOURCES.has((t as any).source));
  const hasTransactions = realTxs.length > 0;
  const hasProfile = !!profile;

  let baseTxs: TransactionLike[];
  let state: PersonalState;
  if (isDemo) {
    baseTxs = allTxs;
    state = computePersonalState(allTxs);
  } else if (hasTransactions) {
    baseTxs = realTxs;
    state = computePersonalState(realTxs);
  } else if (profile) {
    // No real transactions: derive canonical headline numbers straight from the profile, and feed
    // the engine an in-memory (NOT persisted) history so forecast/resilience work from real data.
    baseTxs = generatePersonalTransactions(profile as any).map(r => ({
      date: r.date, amount: r.amount, category: r.category, vendor: r.vendor, currency: r.currency,
    })) as unknown as TransactionLike[];
    state = computePersonalStateFromProfile(profile);
  } else {
    baseTxs = [];
    state = computePersonalState([]);
  }
  return { profile, currency, isDemo, allTxs, realTxs, baseTxs, state, hasProfile, hasTransactions };
}

function fiInputFromBase(b: CanonicalBase, multiplier?: number) {
  const p = b.profile;
  return {
    essentialMonthly: b.state.essential30d,
    monthlySurplus: b.state.surplus30d,
    monthlyIncome: b.state.income30d,
    cash: b.state.cash,
    investments: p?.investments ?? 0,
    discretionaryMonthly: b.state.discretionary30d,
    monthlyDebtPayment: p?.monthlyDebtPayment ?? 0,
    multiplier,
    currency: b.currency,
  };
}

export const personalService = {
  /** Resolve the user's personal workspace (kind='personal') regardless of active session org. */
  async findWorkspaceForUser(userId: string): Promise<OrganizationDoc | null> {
    const memberships = await membershipsRepo.listByUser(userId);
    if (memberships.length === 0) return null;
    const orgs = await orgsRepo.listByIds(memberships.map(m => m.organizationId));
    return orgs.find(o => o.kind === 'personal') ?? null;
  },

  async getOverview(org: OrganizationDoc): Promise<PersonalOverview> {
    const b = await resolveBase(org);
    const health = computePersonalHealth(b.state, { monthlyDebtPayment: b.profile?.monthlyDebtPayment });
    const resilience = computePersonalResilience(b.baseTxs, { monthlyDebtPayment: b.profile?.monthlyDebtPayment });

    // Transaction analytics ONLY from real transactions (empty state otherwise — no fabrication).
    const analyticsTxs = b.isDemo ? b.allTxs : b.realTxs;
    const changes = b.hasTransactions || b.isDemo ? computeWhatChanged(analyticsTxs) : [];
    const anomalies = (b.hasTransactions || b.isDemo) && analyticsTxs.length >= 4 ? computeAnomalies(analyticsTxs) : [];

    const forecast = b.baseTxs.length >= 3 ? forecastCash(b.baseTxs, [], 90) : null;
    const allAlerts = computePersonalAlerts({ state: b.state, resilience, forecast, anomalies, currency: b.currency });

    const investments = b.profile?.investments ?? 0;
    const totalDebt = b.profile?.totalDebt ?? 0;
    return {
      workspace: { id: org.id, name: org.name, isDemo: b.isDemo },
      currency: b.currency,
      state: b.state, health, resilience, changes,
      alerts: getTopAlerts(allAlerts, 3),
      position: { cash: b.state.cash, investments, totalDebt, netWorth: Math.round(b.state.cash + investments - totalDebt) || 0 },
      goal: b.profile?.goal ?? null,
      hasProfile: b.hasProfile,
      hasTransactions: b.hasTransactions,
    };
  },

  /** 90-day forecast grounded in the profile (works with zero transactions) + sensitivities. */
  async getForecast(org: OrganizationDoc): Promise<PersonalForecastResponse> {
    const b = await resolveBase(org);
    const resilience = computePersonalResilience(b.baseTxs, { monthlyDebtPayment: b.profile?.monthlyDebtPayment });
    const forecast = b.baseTxs.length >= 3
      ? forecastCash(b.baseTxs, [], 90)
      : emptyForecast(b.state.cash);

    // Driver summary from forecast events
    const driverMap = new Map<string, { kind: string; totalAmount: number }>();
    for (const day of forecast.series) for (const drv of day.drivers ?? []) {
      const e = driverMap.get(drv.label);
      if (e) e.totalAmount += drv.amount; else driverMap.set(drv.label, { kind: drv.kind, totalAmount: drv.amount });
    }
    const drivers: ForecastDriverSummary[] = [...driverMap.entries()]
      .map(([label, d]) => ({ label, kind: d.kind, monthlyAmount: Math.round((d.totalAmount / 90) * 30), direction: (d.totalAmount >= 0 ? 'inflow' : 'outflow') as 'inflow' | 'outflow' }))
      .sort((a, c) => Math.abs(c.monthlyAmount) - Math.abs(a.monthlyAmount));

    // Profile-grounded headline projections + sensitivities (deterministic, 0% return baseline)
    const income = b.state.income30d, spend = b.state.spend30d, surplus = b.state.surplus30d, start = b.state.cash;
    const proj = (monthlySurplus: number, months: number) => Math.round(start + monthlySurplus * months);
    const sensitivities: ForecastSensitivity[] = [
      { key: 'current', label: 'Current trajectory', monthlySurplus: surplus, day90: proj(surplus, 3) },
      { key: 'income_down_20', label: 'Income −20%', monthlySurplus: Math.round(income * 0.8 - spend), day90: proj(Math.round(income * 0.8 - spend), 3) },
      { key: 'expenses_up_20', label: 'Expenses +20%', monthlySurplus: Math.round(income - spend * 1.2), day90: proj(Math.round(income - spend * 1.2), 3) },
    ];

    const change = proj(surplus, 3) - start;
    const dir = change >= 0 ? 'grow' : 'shrink';
    const explanation = `Projection based on your saved profile: ${dir} by about ${b.currency} ${Math.abs(change).toLocaleString('en-IN')} over 90 days at your current monthly surplus of ${b.currency} ${surplus.toLocaleString('en-IN')}. Projections are estimates, not guarantees.`;

    return {
      forecast, currency: b.currency, resilience, drivers, explanation,
      knownCount: 0, projectedCount: drivers.length,
      metrics: { monthlyIncome: income, monthlyExpenses: spend, monthlySurplus: surplus, savingsRate: b.state.savingsRate, currentCash: start },
      projections: { startingCash: start, day30: proj(surplus, 1), day60: proj(surplus, 2), day90: proj(surplus, 3) },
      sensitivities,
      assumptions: [
        'Projections assume your current monthly income and expenses continue unchanged.',
        'A conservative 0% real investment return is assumed for cash projections.',
        'These are deterministic estimates from your profile — not guarantees.',
      ],
      hasProfile: b.hasProfile,
      hasTransactions: b.hasTransactions,
    };
  },

  async getAlerts(org: OrganizationDoc): Promise<PersonalAlertsResponse> {
    const b = await resolveBase(org);
    const resilience = computePersonalResilience(b.baseTxs, { monthlyDebtPayment: b.profile?.monthlyDebtPayment });
    const forecast = b.baseTxs.length >= 3 ? forecastCash(b.baseTxs, [], 90) : null;
    const analyticsTxs = b.isDemo ? b.allTxs : b.realTxs;
    const anomalies = analyticsTxs.length >= 4 ? computeAnomalies(analyticsTxs) : [];
    const alerts = computePersonalAlerts({ state: b.state, resilience, forecast, anomalies, currency: b.currency });
    return {
      alerts, currency: b.currency,
      summary: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
        total: alerts.length,
      },
    };
  },

  /** Financial Freedom / FI — deterministic, from the canonical profile-derived state. */
  async getFinancialFreedom(org: OrganizationDoc, multiplier?: number): Promise<FinancialFreedomResponse> {
    const b = await resolveBase(org);
    const freedom = computeFinancialFreedom(fiInputFromBase(b, multiplier));
    return { freedom, currency: b.currency, hasProfile: b.hasProfile };
  },

  /** Confirmation summary shown right after onboarding (re-fetched + recomputed from saved data). */
  async getOnboardingSummary(org: OrganizationDoc) {
    const b = await resolveBase(org);
    const p = b.profile;
    return {
      currency: b.currency,
      profile: p ? {
        monthlyIncome: p.monthlyIncome, essentialMonthly: p.essentialMonthly, discretionaryMonthly: p.discretionaryMonthly,
        cash: p.cash, investments: p.investments, totalDebt: p.totalDebt, monthlyDebtPayment: p.monthlyDebtPayment, goal: p.goal ?? null,
      } : null,
      metrics: {
        monthlyIncome: b.state.income30d,
        monthlyExpenses: b.state.spend30d,
        monthlySurplus: b.state.surplus30d,
        savingsRate: b.state.savingsRate,
        cash: b.state.cash,
        investments: p?.investments ?? 0,
        financialAssets: Math.round(b.state.cash + (p?.investments ?? 0)) || 0,
      },
      hasProfile: b.hasProfile,
      hasTransactions: b.hasTransactions,
    };
  },

  /** Canonical context for the Ask Nexus tool registry (grounding: never demo/defaults for real users). */
  async buildToolContext(org: OrganizationDoc) {
    const b = await resolveBase(org);
    const resilience = computePersonalResilience(b.baseTxs, { monthlyDebtPayment: b.profile?.monthlyDebtPayment });
    return {
      organizationId: org.id,
      txs: b.baseTxs,
      realTxs: b.isDemo ? b.allTxs : b.realTxs,
      hasTransactions: b.hasTransactions || b.isDemo,
      state: b.state,
      resilience,
      currency: b.currency,
      profile: {
        monthlyIncome: b.profile?.monthlyIncome,
        essentialMonthly: b.profile?.essentialMonthly,
        discretionaryMonthly: b.profile?.discretionaryMonthly,
        cash: b.profile?.cash,
        investments: b.profile?.investments,
        totalDebt: b.profile?.totalDebt,
        monthlyDebtPayment: b.profile?.monthlyDebtPayment,
        currency: b.currency,
        goal: b.profile?.goal ?? undefined,
      },
    };
  },
};

function emptyForecast(startingCash: number): ForecastResult {
  return {
    series: [{ day: new Date().toISOString().slice(0, 10), cash: Math.round(startingCash) || 0, net: 0 }],
    startingCash: Math.round(startingCash) || 0,
    endingCash: Math.round(startingCash) || 0,
    baselineDailyRev: 0, baselineDailyExp: 0, scheduledEvents: 0,
    narrative: 'Not enough history yet to chart a detailed daily forecast — see the profile-based projection above.',
    lowestDay: { day: new Date().toISOString().slice(0, 10), cash: Math.round(startingCash) || 0 },
  };
}
