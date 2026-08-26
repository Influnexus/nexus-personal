// Shared core — KPI / breakdown / vendor / overdue / recommendation math. Extracted VERBATIM
// from lib/services/finance.service.ts (Sprint P1) with one change only: the clock is injectable
// (`now` param, defaults to new Date()) so functions are deterministic in tests. Default
// behavior is identical to the pre-extraction implementation.
import { TransactionLike, InvoiceLike, Kpis, ExpenseSlice, VendorSpend, Anomaly, Recommendation, daysAgoFrom, sum } from './types';

export function computeKpis(txs: TransactionLike[], invoices: InvoiceLike[], now: Date = new Date()): Kpis {
  const last30 = txs.filter(t => new Date(t.date) >= daysAgoFrom(now, 30));
  const prev30 = txs.filter(t => { const d = new Date(t.date); return d >= daysAgoFrom(now, 60) && d < daysAgoFrom(now, 30); });
  const rev = sum(last30.filter(t => t.amount > 0).map(t => t.amount));
  const exp = -sum(last30.filter(t => t.amount < 0).map(t => t.amount));
  const prevRev = sum(prev30.filter(t => t.amount > 0).map(t => t.amount));
  const prevExp = -sum(prev30.filter(t => t.amount < 0).map(t => t.amount));
  const cash = sum(txs.map(t => t.amount));
  const burn = Math.max(exp - rev, 0);
  const runwayDays = burn > 0 ? Math.floor((cash / burn) * 30) : null;
  const outstanding = invoices.filter(i => i.status === 'open' || i.status === 'overdue');
  return {
    revenue30d: rev, expenses30d: exp, profit30d: rev - exp, cash,
    burnRate: burn, runwayDays,
    outstandingInvoices: outstanding.length,
    outstandingAmount: sum(outstanding.map(i => i.amount || 0)),
    revDeltaPct: prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : 0,
    expDeltaPct: prevExp > 0 ? ((exp - prevExp) / prevExp) * 100 : 0,
  };
}

export function computeExpenseBreakdown(txs: TransactionLike[], days = 30, now: Date = new Date()): ExpenseSlice[] {
  const tx = txs.filter(t => t.amount < 0 && new Date(t.date) >= daysAgoFrom(now, days));
  const total = -sum(tx.map(t => t.amount));
  const byCat = new Map<string, number>();
  for (const t of tx) byCat.set(t.category, (byCat.get(t.category) || 0) + -t.amount);
  return [...byCat.entries()].map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 })).sort((a, b) => b.amount - a.amount);
}

export function computeTopVendors(txs: TransactionLike[], days = 90, now: Date = new Date()): VendorSpend[] {
  const tx = txs.filter(t => t.amount < 0 && new Date(t.date) >= daysAgoFrom(now, days));
  const m = new Map<string, { amount: number; count: number }>();
  for (const t of tx) { const cur = m.get(t.vendor) || { amount: 0, count: 0 }; cur.amount += -t.amount; cur.count += 1; m.set(t.vendor, cur); }
  return [...m.entries()].map(([vendor, v]) => ({ vendor, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 10);
}

export function computeOverdueInvoices<T extends InvoiceLike>(invoices: T[], now: Date = new Date()): T[] {
  return invoices
    .filter(i => (i.status === 'open' || i.status === 'overdue') && i.dueDate && new Date(i.dueDate) < now)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

export function computeRecommendations(input: { kpis: Kpis; overdue: InvoiceLike[]; anomalies: Anomaly[]; topVendors: VendorSpend[] }): Recommendation[] {
  const { kpis: k, overdue, anomalies, topVendors: top } = input;
  const recs: Recommendation[] = [];
  if (overdue.length > 0) {
    const amt = overdue.reduce((s, i) => s + (i.amount || 0), 0);
    const top1 = overdue[0];
    recs.push({ id: 'overdue', title: `Collect ${overdue.length} overdue invoice(s) — $${amt.toLocaleString()}`, reason: `Largest: ${top1.vendor} ($${(top1.amount || 0).toLocaleString()}) due ${top1.dueDate}.`, impact: 'high', action: `Send reminder to ${top1.vendor} today; escalate within 7 days.` });
  }
  if (k.runwayDays != null && k.runwayDays < 120) {
    recs.push({ id: 'runway', title: 'Extend cash runway', reason: `Only ${k.runwayDays} days at current $${k.burnRate.toLocaleString()}/mo burn.`, impact: 'high', action: 'Defer non-essential spend; accelerate AR collections to close the gap.' });
  }
  if (anomalies.length > 0) {
    const a = anomalies[0];
    recs.push({ id: 'anomaly', title: `Review unusual ${a.vendor} charge — $${Math.round(a.amount).toLocaleString()}`, reason: a.reason, impact: 'med', action: `Verify the ${a.date} charge with ${a.vendor}; dispute if unauthorized.` });
  }
  const subs = top.find(v => /subscription|saas|software|adobe|zoom|notion|figma|slack|aws|gcp|datadog/i.test(v.vendor));
  if (subs && subs.amount > 800) {
    recs.push({ id: 'subs', title: `Audit ${subs.vendor} spend`, reason: `${subs.vendor} reached $${Math.round(subs.amount).toLocaleString()} in last 60 days across ${subs.count} charges.`, impact: 'med', action: 'Consolidate seats or downgrade tier; cancel unused tools.' });
  }
  if (k.expDeltaPct > 15) {
    recs.push({ id: 'expgrowth', title: 'Investigate rising expenses', reason: `Expenses up ${k.expDeltaPct.toFixed(1)}% vs prior 30 days.`, impact: 'med', action: 'Compare category breakdown month-over-month to isolate the driver.' });
  }
  if (recs.length === 0) recs.push({ id: 'ok', title: 'Maintain current trajectory', reason: 'No urgent risks detected in the last 30 days.', impact: 'low', action: 'Continue monthly reviews and forecast updates.' });
  return recs.slice(0, 5);
}
