// Enterprise finance service — Sprint P1: now a THIN delegation layer over the shared
// Financial Intelligence Core (lib/core/finance). This service owns data access (org-scoped
// repos) only; ALL math lives in the pure core. Public method signatures and behavior are
// unchanged from the pre-P1 implementation — verified against a golden-master snapshot.
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo, Invoice } from '@/lib/repositories/invoices';
import {
  computeKpis, computeExpenseBreakdown, computeTopVendors, computeOverdueInvoices, computeRecommendations,
  computeBusinessHealthScore, computeAnomalies, forecastCash,
} from '@/lib/core/finance';

// Re-export the core types under their historical names so any existing type imports keep working.
export type { Kpis, HealthScoreBreakdown, Anomaly, ExpenseSlice, VendorSpend } from '@/lib/core/finance';

export const financeService = {
  async kpis(orgId: string) {
    const [txs, invoices] = await Promise.all([transactionsRepo.listByOrg(orgId), invoicesRepo.listByOrg(orgId)]);
    return computeKpis(txs, invoices);
  },

  async healthScore(orgId: string) {
    const k = await this.kpis(orgId);
    return computeBusinessHealthScore(k);
  },

  async expenseBreakdown(orgId: string, days = 30) {
    const txs = await transactionsRepo.listByOrg(orgId);
    return computeExpenseBreakdown(txs, days);
  },

  async topVendors(orgId: string, days = 90) {
    const txs = await transactionsRepo.listByOrg(orgId);
    return computeTopVendors(txs, days);
  },

  async anomalies(orgId: string) {
    const txs = await transactionsRepo.listByOrg(orgId);
    return computeAnomalies(txs);
  },

  async cashflowForecast(orgId: string, days = 90) {
    const [txs, invs] = await Promise.all([transactionsRepo.listByOrg(orgId), invoicesRepo.listByOrg(orgId)]);
    return forecastCash(txs, invs, days);
  },

  async overdueInvoices(orgId: string): Promise<Invoice[]> {
    const inv = await invoicesRepo.listByOrg(orgId);
    return computeOverdueInvoices(inv);
  },

  async recommendations(orgId: string) {
    const [k, overdue, anomalies, top] = await Promise.all([
      this.kpis(orgId), this.overdueInvoices(orgId), this.anomalies(orgId), this.topVendors(orgId, 60),
    ]);
    return computeRecommendations({ kpis: k, overdue, anomalies, topVendors: top });
  },
};
