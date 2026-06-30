// Forecast v2 — incorporates scheduled cash events:
//  • known invoice due dates (receivables in, payables out)
//  • detected recurring transactions (revenue + expenses) projected forward at their cadence
//  • modeled day-by-day with running balance + drivers per day

import { Transaction } from '@/lib/repositories/transactions';
import { Invoice } from '@/lib/repositories/invoices';

export interface ForecastDriver { kind: 'recurring_revenue' | 'recurring_expense' | 'invoice_in' | 'invoice_out'; label: string; amount: number }
export interface ForecastDay {
  day: string;
  cash: number;
  net: number;
  drivers?: ForecastDriver[];
}
export interface ForecastResult {
  series: ForecastDay[];
  startingCash: number;
  endingCash: number;
  baselineDailyRev: number;
  baselineDailyExp: number;
  scheduledEvents: number;
  narrative: string;
  lowestDay: { day: string; cash: number };
}

function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Detect vendors whose expenses recur on a stable cadence.
function detectRecurring(txs: Transaction[]): { vendor: string; avgAmount: number; cadenceDays: number; sign: 1 | -1 }[] {
  const byVendor = new Map<string, Transaction[]>();
  for (const t of txs) {
    const a = byVendor.get(t.vendor) || []; a.push(t); byVendor.set(t.vendor, a);
  }
  const out: { vendor: string; avgAmount: number; cadenceDays: number; sign: 1 | -1 }[] = [];
  for (const [vendor, arr] of byVendor) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
      if (g > 0) gaps.push(g);
    }
    if (gaps.length < 2) continue;
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
    const cv = avgGap > 0 ? Math.sqrt(variance) / avgGap : 1;
    // Stable cadence: low CV and at least 3 observations within ~6 months
    if (cv < 0.45 && avgGap >= 5 && avgGap <= 35) {
      const avgAmount = arr.reduce((s, t) => s + Math.abs(t.amount), 0) / arr.length;
      const sign: 1 | -1 = arr[0].amount >= 0 ? 1 : -1;
      out.push({ vendor, avgAmount, cadenceDays: Math.round(avgGap), sign });
    }
  }
  return out;
}

export function forecastCash(txs: Transaction[], invoices: Invoice[], days = 90): ForecastResult {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startCash = txs.reduce((s, t) => s + t.amount, 0);
  const last30 = txs.filter(t => new Date(t.date) >= daysAgo(30));
  const baselineRev = last30.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) / 30;
  const baselineExp = -last30.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0) / 30;

  // Build scheduled cash events.
  const events = new Map<string, ForecastDriver[]>();
  const push = (day: string, drv: ForecastDriver) => { const a = events.get(day) || []; a.push(drv); events.set(day, a); };

  // 1. Invoices due (only future, unpaid)
  for (const inv of invoices) {
    if (!inv.dueDate) continue;
    if (inv.status !== 'open' && inv.status !== 'overdue') continue;
    const d = new Date(inv.dueDate); d.setHours(0, 0, 0, 0);
    // Overdue → assume collection in 7 days; future → use due date
    const target = d < today ? addDays(today, 7) : d;
    if (target > addDays(today, days)) continue;
    if (inv.direction === 'receivable') push(dateKey(target), { kind: 'invoice_in', label: `${inv.vendor} (#${inv.invoiceNumber || '—'})`, amount: inv.amount });
    else push(dateKey(target), { kind: 'invoice_out', label: `${inv.vendor} (#${inv.invoiceNumber || '—'})`, amount: -inv.amount });
  }

  // 2. Recurring transactions projected forward at their cadence (exclude one-off anomalies).
  const recurring = detectRecurring(txs);
  for (const r of recurring) {
    const sortedDates = txs.filter(t => t.vendor === r.vendor).map(t => t.date).sort();
    const lastSeen = new Date(sortedDates[sortedDates.length - 1]);
    let next = addDays(lastSeen, r.cadenceDays);
    while (next <= addDays(today, days)) {
      if (next >= today) {
        push(dateKey(next), {
          kind: r.sign > 0 ? 'recurring_revenue' : 'recurring_expense',
          label: r.vendor, amount: r.avgAmount * r.sign,
        });
      }
      next = addDays(next, r.cadenceDays);
    }
  }

  // 3. Generate day-by-day series. Baseline is the non-scheduled "smoothed" daily net; scheduled events
  //    are applied additively on their day.
  const scheduledByDay = new Map(events);
  // Sum scheduled amounts to subtract them from baseline so we don't double-count recurring patterns.
  const horizonStart = today;
  const horizonEnd = addDays(today, days - 1);
  let scheduledTotalIn = 0, scheduledTotalOut = 0;
  for (const drvs of scheduledByDay.values()) for (const d of drvs) (d.amount >= 0 ? (scheduledTotalIn += d.amount) : (scheduledTotalOut += d.amount));
  // Smoothed baseline net per day, after removing what we've already scheduled explicitly.
  const scheduledPerDay = (scheduledTotalIn + scheduledTotalOut) / days;
  const baselineNet = (baselineRev - baselineExp) - scheduledPerDay;

  let cash = startCash;
  const series: ForecastDay[] = [];
  let lowest = { day: dateKey(horizonStart), cash };
  for (let i = 0; i < days; i++) {
    const d = addDays(horizonStart, i);
    const k = dateKey(d);
    const drvs = scheduledByDay.get(k);
    let net = baselineNet;
    if (drvs) for (const x of drvs) net += x.amount;
    cash += net;
    if (cash < lowest.cash) lowest = { day: k, cash: Math.round(cash) };
    series.push({ day: k, cash: Math.round(cash), net: Math.round(net), drivers: drvs });
  }

  const totalScheduled = events.size;
  const recurringNote = recurring.length > 0 ? `${recurring.length} recurring pattern(s) detected (e.g. ${recurring.slice(0, 3).map(r => r.vendor).join(', ')}).` : 'No stable recurring patterns yet.';
  const arNote = invoices.filter(i => (i.status === 'open' || i.status === 'overdue') && i.direction === 'receivable').length;
  const apNote = invoices.filter(i => (i.status === 'open' || i.status === 'overdue') && i.direction === 'payable').length;
  const narrative = [
    `Baseline net: $${Math.round(baselineNet).toLocaleString()}/day after removing scheduled cash events.`,
    recurringNote,
    `${arNote} open receivable(s) and ${apNote} open payable(s) scheduled.`,
    `Lowest projected balance: $${lowest.cash.toLocaleString()} on ${lowest.day}.`,
  ].join(' ');

  return {
    series,
    startingCash: Math.round(startCash),
    endingCash: Math.round(series.at(-1)?.cash ?? startCash),
    baselineDailyRev: Math.round(baselineRev),
    baselineDailyExp: Math.round(baselineExp),
    scheduledEvents: totalScheduled,
    narrative,
    lowestDay: lowest,
  };
}
