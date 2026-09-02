// Shared core — day-by-day cash forecast. Extracted VERBATIM from
// lib/services/forecast.service.ts forecastCash() (Sprint P1). The ONLY change is an injectable
// clock (`now` param, defaults to new Date()) — default behavior is identical.
//
// Forecast v2 — incorporates scheduled cash events:
//  • known invoice due dates (receivables in, payables out)
//  • detected recurring transactions (revenue + expenses) projected forward at their cadence
//  • modeled day-by-day with running balance + drivers per day
import { TransactionLike, InvoiceLike, ForecastDriver, ForecastDay, ForecastResult, dateKey, daysAgoFrom, addDays } from './types';
import { detectRecurring } from './recurring';

export function forecastCash(txs: TransactionLike[], invoices: InvoiceLike[], days = 90, now: Date = new Date()): ForecastResult {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const startCash = txs.reduce((s, t) => s + t.amount, 0);
  const last30 = txs.filter(t => new Date(t.date) >= daysAgoFrom(now, 30));
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
