// Nexus Personal service — Sprint P1 SKELETON. A thin, org-scoped wrapper over the shared
// Financial Intelligence Core (lib/core/finance). It owns data access only; ALL math lives in
// the pure core — there is deliberately NO second calculation engine.
//
// P1 scope: just enough surface to prove session → personal workspace → shared core works.
// P2+ will add: personal health factors, scenario levers UI, goals, alerts, Ask Nexus Personal.
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo } from '@/lib/repositories/invoices';
import {
  computeKpis, computeExpenseBreakdown, computeResilience, forecastCash,
  ExpenseSlice, ResilienceReport, ForecastResult,
} from '@/lib/core/finance';

export interface PersonalStateSnapshot {
  cashOnHand: number;
  income30d: number;
  spend30d: number;
  net30d: number;
  savingsRate: number; // net / income (0 when no income)
  transactionCount: number;
  topCategories: ExpenseSlice[];
}

export const personalService = {
  /** Minimal financial state snapshot — P1 proof that the shared core powers Personal. */
  async getStateSnapshot(orgId: string): Promise<PersonalStateSnapshot> {
    const [txs, invoices] = await Promise.all([transactionsRepo.listByOrg(orgId), invoicesRepo.listByOrg(orgId)]);
    const k = computeKpis(txs, invoices); // rev/exp semantics map to income/spend for personal
    return {
      cashOnHand: k.cash || 0,
      income30d: k.revenue30d || 0,
      spend30d: k.expenses30d || 0, // || 0 also normalizes JS negative-zero on empty data
      net30d: k.profit30d || 0,
      savingsRate: k.revenue30d > 0 ? Math.round((k.profit30d / k.revenue30d) * 100) / 100 : 0,
      transactionCount: txs.length,
      topCategories: computeExpenseBreakdown(txs, 30).slice(0, 5),
    };
  },

  /** Personal cash forecast — direct reuse of the shared core engine (P1: service-level only). */
  async forecast(orgId: string, days = 90): Promise<ForecastResult> {
    const [txs, invs] = await Promise.all([transactionsRepo.listByOrg(orgId), invoicesRepo.listByOrg(orgId)]);
    return forecastCash(txs, invs, days);
  },

  /** Financial resilience — shared core module (P1: service-level only). */
  async resilience(orgId: string): Promise<ResilienceReport> {
    const txs = await transactionsRepo.listByOrg(orgId);
    return computeResilience(txs);
  },

  // ---- Sprint P2+ surface (intentionally NOT implemented in P1) --------------------------------
  // health(orgId): personal factor set over the shared factor-model shape
  // scenario(orgId, levers): applyLinearScenario + personal levers (one-off purchase, category cuts)
  // goals CRUD + progress: new `goals` collection
  // alerts(orgId): computed-on-read deterministic rules
};
