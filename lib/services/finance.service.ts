import { Transaction, Invoice } from '@/lib/db/models';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo } from '@/lib/repositories/invoices';

export interface Kpis {
  revenue30d: number;
  expenses30d: number;
  profit30d: number;
  cash: number;
  burnRate: number; // monthly net spend
  runwayDays: number | null;
  outstandingInvoices: number;
  outstandingAmount: number;
  revDeltaPct: number; // vs prior 30d
  expDeltaPct: number;
}

export interface HealthScoreBreakdown {
  score: number; // 0..100
  band: 'excellent' | 'strong' | 'fair' | 'weak' | 'at_risk';
  factors: { label: string; impact: number; note: string }[];
}

export interface Anomaly {
  transactionId: string;
  date: string;
  vendor: string;
  amount: number;
  category: string;
  reason: string;
}

export interface ExpenseSlice { category: string; amount: number; share: number }
export interface VendorSpend { vendor: string; amount: number; count: number }

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

export const financeService = {
  async kpis(orgId: string): Promise<Kpis> {
    const all = await transactionsRepo.listByOrg(orgId);
    const last30 = all.filter(t => new Date(t.date) >= daysAgo(30));
    const prev30 = all.filter(t => { const d = new Date(t.date); return d >= daysAgo(60) && d < daysAgo(30); });
    const rev = sum(last30.filter(t => t.amount > 0).map(t => t.amount));
    const exp = -sum(last30.filter(t => t.amount < 0).map(t => t.amount));
    const prevRev = sum(prev30.filter(t => t.amount > 0).map(t => t.amount));
    const prevExp = -sum(prev30.filter(t => t.amount < 0).map(t => t.amount));
    const cash = sum(all.map(t => t.amount));
    const burn = Math.max(exp - rev, 0);
    const runwayDays = burn > 0 ? Math.floor((cash / burn) * 30) : null;
    const invoices = await invoicesRepo.listByOrg(orgId);
    const outstanding = invoices.filter(i => i.status === 'open' || i.status === 'overdue');
    return {
      revenue30d: rev,
      expenses30d: exp,
      profit30d: rev - exp,
      cash,
      burnRate: burn,
      runwayDays,
      outstandingInvoices: outstanding.length,
      outstandingAmount: sum(outstanding.map(i => i.amount || 0)),
      revDeltaPct: prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : 0,
      expDeltaPct: prevExp > 0 ? ((exp - prevExp) / prevExp) * 100 : 0,
    };
  },

  async healthScore(orgId: string): Promise<HealthScoreBreakdown> {
    const k = await this.kpis(orgId);
    const factors: { label: string; impact: number; note: string }[] = [];
    let score = 50;
    // Profit margin
    const margin = k.revenue30d > 0 ? (k.profit30d / k.revenue30d) : -1;
    const marginPts = Math.max(-20, Math.min(25, margin * 50));
    score += marginPts;
    factors.push({ label: 'Profit margin', impact: Math.round(marginPts), note: `${(margin * 100).toFixed(1)}% net margin (30d)` });
    // Cash runway
    const runwayPts = k.runwayDays == null ? 15 : k.runwayDays >= 365 ? 20 : k.runwayDays >= 180 ? 12 : k.runwayDays >= 90 ? 4 : -15;
    score += runwayPts;
    factors.push({ label: 'Cash runway', impact: runwayPts, note: k.runwayDays == null ? 'Cash-flow positive' : `${k.runwayDays} days` });
    // Revenue growth
    const growthPts = Math.max(-10, Math.min(15, k.revDeltaPct / 2));
    score += growthPts;
    factors.push({ label: 'Revenue growth', impact: Math.round(growthPts), note: `${k.revDeltaPct >= 0 ? '+' : ''}${k.revDeltaPct.toFixed(1)}% vs prior 30d` });
    // Outstanding AR
    const arPts = k.outstandingAmount > 50000 ? -8 : k.outstandingAmount > 20000 ? -3 : 5;
    score += arPts;
    factors.push({ label: 'Accounts receivable', impact: arPts, note: `${k.outstandingInvoices} open invoice(s), $${k.outstandingAmount.toLocaleString()}` });
    // Expense control
    const ctlPts = k.expDeltaPct > 25 ? -8 : k.expDeltaPct > 10 ? -3 : 5;
    score += ctlPts;
    factors.push({ label: 'Expense control', impact: ctlPts, note: `${k.expDeltaPct >= 0 ? '+' : ''}${k.expDeltaPct.toFixed(1)}% vs prior 30d` });

    score = Math.max(0, Math.min(100, Math.round(score)));
    const band: HealthScoreBreakdown['band'] = score >= 85 ? 'excellent' : score >= 70 ? 'strong' : score >= 55 ? 'fair' : score >= 40 ? 'weak' : 'at_risk';
    return { score, band, factors };
  },

  async expenseBreakdown(orgId: string, days = 30): Promise<ExpenseSlice[]> {
    const tx = (await transactionsRepo.listByOrg(orgId)).filter(t => t.amount < 0 && new Date(t.date) >= daysAgo(days));
    const total = -sum(tx.map(t => t.amount));
    const byCat = new Map<string, number>();
    for (const t of tx) byCat.set(t.category, (byCat.get(t.category) || 0) + -t.amount);
    return [...byCat.entries()].map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount);
  },

  async topVendors(orgId: string, days = 90): Promise<VendorSpend[]> {
    const tx = (await transactionsRepo.listByOrg(orgId)).filter(t => t.amount < 0 && new Date(t.date) >= daysAgo(days));
    const m = new Map<string, { amount: number; count: number }>();
    for (const t of tx) {
      const cur = m.get(t.vendor) || { amount: 0, count: 0 };
      cur.amount += -t.amount; cur.count += 1; m.set(t.vendor, cur);
    }
    return [...m.entries()].map(([vendor, v]) => ({ vendor, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 10);
  },

  async anomalies(orgId: string): Promise<Anomaly[]> {
    const all = await transactionsRepo.listByOrg(orgId);
    // Build mean+stdev per (vendor) and flag transactions > 2.5 stdev away.
    const byVendor = new Map<string, Transaction[]>();
    for (const t of all.filter(x => x.amount < 0)) {
      const arr = byVendor.get(t.vendor) || []; arr.push(t); byVendor.set(t.vendor, arr);
    }
    const out: Anomaly[] = [];
    for (const [vendor, txs] of byVendor) {
      if (txs.length < 4) continue;
      const amts = txs.map(t => -t.amount);
      const mean = amts.reduce((a, b) => a + b, 0) / amts.length;
      const sd = Math.sqrt(amts.reduce((s, v) => s + (v - mean) ** 2, 0) / amts.length);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
      for (const t of txs) {
        if (new Date(t.date) < cutoff) continue;
        const z = sd > 0 ? (-t.amount - mean) / sd : 0;
        if (z > 2.2 && -t.amount > mean + 100) {
          out.push({ transactionId: t.id, date: t.date, vendor, amount: -t.amount, category: t.category,
            reason: `Unusually large ${vendor} charge — ${(z).toFixed(1)}σ above norm ($${Math.round(mean)})` });
        }
      }
    }
    return out.sort((a, b) => b.amount - a.amount).slice(0, 5);
  },

  async cashflowForecast(orgId: string, days = 90) {
    const all = await transactionsRepo.listByOrg(orgId);
    // Build a 30-day daily average from history, then project forward.
    const last30 = all.filter(t => new Date(t.date) >= daysAgo(30));
    const dailyRev = sum(last30.filter(t => t.amount > 0).map(t => t.amount)) / 30;
    const dailyExp = -sum(last30.filter(t => t.amount < 0).map(t => t.amount)) / 30;
    const net = dailyRev - dailyExp;
    let cash = sum(all.map(t => t.amount));
    const series: { day: string; cash: number; revenue: number; expenses: number }[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      cash += net;
      const d = new Date(today); d.setDate(d.getDate() + i);
      series.push({ day: d.toISOString().slice(0, 10), cash: Math.round(cash), revenue: Math.round(dailyRev), expenses: Math.round(dailyExp) });
    }
    return { series, dailyRev: Math.round(dailyRev), dailyExp: Math.round(dailyExp), net: Math.round(net) };
  },

  async overdueInvoices(orgId: string): Promise<Invoice[]> {
    const inv = await invoicesRepo.listByOrg(orgId);
    const now = new Date();
    return inv.filter(i => (i.status === 'open' || i.status === 'overdue') && i.dueDate && new Date(i.dueDate) < now)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  },

  async recommendations(orgId: string): Promise<{ id: string; title: string; reason: string; impact: 'high' | 'med' | 'low'; action: string }[]> {
    const k = await this.kpis(orgId);
    const overdue = await this.overdueInvoices(orgId);
    const anomalies = await this.anomalies(orgId);
    const top = await this.topVendors(orgId, 60);
    const recs: { id: string; title: string; reason: string; impact: 'high' | 'med' | 'low'; action: string }[] = [];
    if (overdue.length > 0) {
      const amt = overdue.reduce((s, i) => s + (i.amount || 0), 0);
      recs.push({ id: 'overdue', title: `Follow up on ${overdue.length} overdue invoice(s)`, reason: `$${amt.toLocaleString()} in receivables past due.`, impact: 'high', action: 'Send reminder emails this week.' });
    }
    if (k.runwayDays != null && k.runwayDays < 120) {
      recs.push({ id: 'runway', title: 'Extend cash runway', reason: `Only ${k.runwayDays} days of runway at current burn.`, impact: 'high', action: 'Defer non-essential spend; accelerate AR collections.' });
    }
    if (anomalies.length > 0) {
      recs.push({ id: 'anomaly', title: `Review ${anomalies.length} unusual expense(s)`, reason: anomalies.map(a => `${a.vendor} ($${Math.round(a.amount).toLocaleString()})`).join(', '), impact: 'med', action: 'Verify charges; dispute or categorize accurately.' });
    }
    const subs = top.find(v => /subscription|saas|software|adobe|zoom|notion|figma|slack|aws|gcp|datadog/i.test(v.vendor));
    if (subs && subs.amount > 800) {
      recs.push({ id: 'subs', title: 'Audit SaaS subscriptions', reason: `${subs.vendor} spend has reached $${Math.round(subs.amount).toLocaleString()}/60d.`, impact: 'med', action: 'Consolidate seats; cancel unused tools.' });
    }
    if (k.expDeltaPct > 15) {
      recs.push({ id: 'expgrowth', title: 'Investigate rising expenses', reason: `Expenses up ${k.expDeltaPct.toFixed(1)}% vs prior 30d.`, impact: 'med', action: 'Compare category breakdown month-over-month.' });
    }
    if (recs.length === 0) {
      recs.push({ id: 'ok', title: 'Maintain current trajectory', reason: 'No urgent risks detected.', impact: 'low', action: 'Continue monthly reviews and forecast updates.' });
    }
    return recs.slice(0, 5);
  },
};
