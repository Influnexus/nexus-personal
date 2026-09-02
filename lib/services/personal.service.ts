// Nexus Personal service — Sprint P2, extended Sprint P3 (Forecast + Alerts).
// A thin, org-scoped wrapper over the shared Financial Intelligence Core (lib/core/finance).
// It owns data access + workspace resolution only; ALL math lives in the pure core.
import { transactionsRepo } from '@/lib/repositories/transactions';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { orgsRepo } from '@/lib/repositories/organizations';
import {
  computePersonalState, computePersonalHealth, computePersonalResilience, computeWhatChanged,
  forecastCash, computeAnomalies, computePersonalAlerts, getTopAlerts,
  PersonalState, PersonalHealth, PersonalResilience, PersonalChange,
  ForecastResult, PersonalAlert, Anomaly,
} from '@/lib/core/finance';
import { OrganizationDoc, PersonalProfile } from '@/lib/db/models';

export interface PersonalOverview {
  workspace: { id: string; name: string; isDemo: boolean };
  currency: string;
  state: PersonalState;
  health: PersonalHealth;
  resilience: PersonalResilience;
  changes: PersonalChange[];
  alerts: PersonalAlert[];        // P3: top 3 alerts for dashboard
  position: { cash: number; investments: number; totalDebt: number; netWorth: number };
  goal: string | null;
  hasProfile: boolean;
}

// P3 — Personal forecast response shape
export interface PersonalForecastResponse {
  forecast: ForecastResult;
  currency: string;
  resilience: PersonalResilience;
  drivers: ForecastDriverSummary[];
  explanation: string;
  knownCount: number;
  projectedCount: number;
}

export interface ForecastDriverSummary {
  label: string;
  kind: string;
  monthlyAmount: number;
  direction: 'inflow' | 'outflow';
}

// P3 — Personal alerts response shape
export interface PersonalAlertsResponse {
  alerts: PersonalAlert[];
  currency: string;
  summary: { critical: number; warning: number; info: number; total: number };
}

export const personalService = {
  /** Resolve the user's personal workspace (kind='personal') regardless of active session org. */
  async findWorkspaceForUser(userId: string): Promise<OrganizationDoc | null> {
    const memberships = await membershipsRepo.listByUser(userId);
    if (memberships.length === 0) return null;
    const orgs = await orgsRepo.listByIds(memberships.map(m => m.organizationId));
    return orgs.find(o => o.kind === 'personal') ?? null;
  },

  /** Everything the Personal dashboard needs, computed deterministically by the shared core. */
  async getOverview(org: OrganizationDoc): Promise<PersonalOverview> {
    const txs = await transactionsRepo.listByOrg(org.id);
    const profile: PersonalProfile | undefined = org.personalProfile;
    const state = computePersonalState(txs);
    const health = computePersonalHealth(state, { monthlyDebtPayment: profile?.monthlyDebtPayment });
    const resilience = computePersonalResilience(txs, { monthlyDebtPayment: profile?.monthlyDebtPayment });
    const changes = computeWhatChanged(txs);
    const investments = profile?.investments ?? 0;
    const totalDebt = profile?.totalDebt ?? 0;

    // P3: Compute forecast + anomalies for alerts
    const forecast = txs.length >= 3 ? forecastCash(txs, [], 90) : null;
    const anomalies = txs.length >= 4 ? computeAnomalies(txs) : [];
    const currency = profile?.currency || txs[0]?.currency || 'INR';
    const allAlerts = computePersonalAlerts({ state, resilience, forecast, anomalies, currency });
    const topAlerts = getTopAlerts(allAlerts, 3);

    return {
      workspace: { id: org.id, name: org.name, isDemo: !!org.isDemo },
      currency,
      state, health, resilience, changes,
      alerts: topAlerts,
      position: {
        cash: state.cash,
        investments,
        totalDebt,
        netWorth: Math.round(state.cash + investments - totalDebt) || 0,
      },
      goal: profile?.goal ?? null,
      hasProfile: !!profile,
    };
  },

  /** P3 — 90-day personal cash forecast using the shared deterministic engine. */
  async getForecast(org: OrganizationDoc): Promise<PersonalForecastResponse> {
    const txs = await transactionsRepo.listByOrg(org.id);
    const profile: PersonalProfile | undefined = org.personalProfile;
    const currency = profile?.currency || txs[0]?.currency || 'INR';

    // Personal has no invoices — pass empty array
    const forecast = forecastCash(txs, [], 90);
    const resilience = computePersonalResilience(txs, { monthlyDebtPayment: profile?.monthlyDebtPayment });

    // Build driver summary from forecast events
    const driverMap = new Map<string, { kind: string; totalAmount: number; count: number }>();
    for (const day of forecast.series) {
      if (!day.drivers) continue;
      for (const drv of day.drivers) {
        const existing = driverMap.get(drv.label);
        if (existing) {
          existing.totalAmount += drv.amount;
          existing.count++;
        } else {
          driverMap.set(drv.label, { kind: drv.kind, totalAmount: drv.amount, count: 1 });
        }
      }
    }

    const drivers: ForecastDriverSummary[] = [...driverMap.entries()]
      .map(([label, d]) => ({
        label,
        kind: d.kind,
        monthlyAmount: Math.round((d.totalAmount / 90) * 30),
        direction: (d.totalAmount >= 0 ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
      }))
      .sort((a, b) => Math.abs(b.monthlyAmount) - Math.abs(a.monthlyAmount));

    const knownCount = drivers.filter(d => d.kind === 'invoice_in' || d.kind === 'invoice_out').length;
    const projectedCount = drivers.filter(d => d.kind === 'recurring_revenue' || d.kind === 'recurring_expense').length;

    // Deterministic explanation
    const change = forecast.endingCash - forecast.startingCash;
    const direction = change >= 0 ? 'improve' : 'decline';
    const reason = change >= 0
      ? 'recurring income exceeds recurring essential spending'
      : 'recurring commitments exceed expected income';
    const explanation = `Your cash position is projected to ${direction} over the next 90 days because ${reason}. Projected change: ${change >= 0 ? '+' : ''}${Math.round(change).toLocaleString('en-IN')}.`;

    return { forecast, currency, resilience, drivers, explanation, knownCount, projectedCount };
  },

  /** P3 — All personal alerts, computed deterministically. */
  async getAlerts(org: OrganizationDoc): Promise<PersonalAlertsResponse> {
    const txs = await transactionsRepo.listByOrg(org.id);
    const profile: PersonalProfile | undefined = org.personalProfile;
    const currency = profile?.currency || txs[0]?.currency || 'INR';

    const state = computePersonalState(txs);
    const resilience = computePersonalResilience(txs, { monthlyDebtPayment: profile?.monthlyDebtPayment });
    const forecast = txs.length >= 3 ? forecastCash(txs, [], 90) : null;
    const anomalies = txs.length >= 4 ? computeAnomalies(txs) : [];

    const alerts = computePersonalAlerts({ state, resilience, forecast, anomalies, currency });
    const summary = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
      total: alerts.length,
    };

    return { alerts, currency, summary };
  },
};
