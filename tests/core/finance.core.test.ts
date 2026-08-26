// Sprint P1 — deterministic unit tests for the shared Financial Intelligence Core.
// Run: npx tsx --test tests/core/finance.core.test.ts
// Pure relative imports only — no app/db/session dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKpis, computeExpenseBreakdown, computeTopVendors, computeOverdueInvoices, computeRecommendations } from '../../lib/core/finance/metrics';
import { computeBusinessHealthScore } from '../../lib/core/finance/health';
import { computeAnomalies } from '../../lib/core/finance/anomalies';
import { detectRecurring } from '../../lib/core/finance/recurring';
import { forecastCash } from '../../lib/core/finance/forecast';
import { applyLinearScenario } from '../../lib/core/finance/scenario';
import { computeResilience } from '../../lib/core/finance/resilience';
import { TransactionLike, InvoiceLike } from '../../lib/core/finance/types';

const NOW = new Date('2026-08-12T12:00:00Z'); // injected clock — every test is fully deterministic

const tx = (date: string, amount: number, vendor: string, category = 'Other', id = `${vendor}-${date}-${amount}`): TransactionLike =>
  ({ id, date, description: vendor, vendor, category, amount, currency: 'USD' });

const FIXTURE: TransactionLike[] = [
  tx('2026-07-20', 5000, 'Employer', 'Income'),
  tx('2026-07-25', -2000, 'Rent Co', 'Housing'),
  tx('2026-08-01', -500, 'Grocer', 'Groceries'),
  tx('2026-07-01', 4000, 'Employer', 'Income'),
  tx('2026-07-05', -1000, 'Rent Co', 'Housing'),
];

// ---------- KPIs (hand-computed expectations) ----------
test('computeKpis — exact hand-computed values', () => {
  const k = computeKpis(FIXTURE, [], NOW);
  assert.equal(k.revenue30d, 5000);
  assert.equal(k.expenses30d, 2500);
  assert.equal(k.profit30d, 2500);
  assert.equal(k.cash, 5500);
  assert.equal(k.burnRate, 0);          // profitable → no burn
  assert.equal(k.runwayDays, null);     // cash-flow positive
  assert.equal(k.revDeltaPct, 25);      // 5000 vs 4000
  assert.equal(k.expDeltaPct, 150);     // 2500 vs 1000
  assert.equal(k.outstandingInvoices, 0);
});

test('computeKpis — deterministic (same input ⇒ identical output) and input not mutated', () => {
  const frozen = JSON.stringify(FIXTURE);
  const a = computeKpis(FIXTURE, [], NOW);
  const b = computeKpis(FIXTURE, [], NOW);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(FIXTURE), frozen);
});

// ---------- Health score (verbatim business formula) ----------
test('computeBusinessHealthScore — exact score on fixture KPIs', () => {
  const h = computeBusinessHealthScore(computeKpis(FIXTURE, [], NOW));
  // 50 +25(margin 50%) +15(no burn) +12.5(growth 25%) +5(AR ok) -8(exp +150%) = 99.5 → 100
  assert.equal(h.score, 100);
  assert.equal(h.band, 'excellent');
  assert.equal(h.factors.length, 5);
});

test('computeBusinessHealthScore — clamps to 0..100', () => {
  const bad = computeBusinessHealthScore({ revenue30d: 0, expenses30d: 9000, profit30d: -9000, cash: 100, burnRate: 9000, runwayDays: 0, outstandingInvoices: 90, outstandingAmount: 90000, revDeltaPct: -80, expDeltaPct: 90 });
  assert.ok(bad.score >= 0 && bad.score <= 100);
  assert.equal(bad.band, 'at_risk');
});

// ---------- Breakdown / vendors ----------
test('computeExpenseBreakdown — shares sum to 1 and sorted desc', () => {
  const slices = computeExpenseBreakdown(FIXTURE, 60, NOW);
  const total = slices.reduce((s, x) => s + x.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  for (let i = 1; i < slices.length; i++) assert.ok(slices[i - 1].amount >= slices[i].amount);
});

test('computeTopVendors — aggregates and caps at 10', () => {
  const v = computeTopVendors(FIXTURE, 90, NOW);
  assert.equal(v[0].vendor, 'Rent Co');
  assert.equal(v[0].amount, 3000);
  assert.equal(v[0].count, 2);
  assert.ok(v.length <= 10);
});

// ---------- Recurring detection ----------
test('detectRecurring — finds a stable monthly pattern', () => {
  const monthly = ['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'].map(d => tx(d, -15.99, 'Netflix', 'Subscriptions'));
  const patterns = detectRecurring(monthly);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].vendor, 'Netflix');
  assert.equal(patterns[0].sign, -1);
  assert.equal(patterns[0].cadenceDays, 31); // round(avg gaps 31,30,31)
  assert.ok(Math.abs(patterns[0].avgAmount - 15.99) < 1e-9);
});

test('detectRecurring — ignores irregular vendors', () => {
  const irregular = [tx('2026-01-01', -50, 'X'), tx('2026-01-03', -50, 'X'), tx('2026-04-20', -50, 'X')];
  assert.equal(detectRecurring(irregular).length, 0);
});

// ---------- Anomalies ----------
test('computeAnomalies — flags a recent 2.2σ+ outlier only', () => {
  const base = ['2026-06-01', '2026-06-15', '2026-07-01', '2026-07-15', '2026-08-01'].map(d => tx(d, -100, 'Amazon', 'Shopping'));
  const spike = tx('2026-08-05', -1000, 'Amazon', 'Shopping', 'spike-1');
  const out = computeAnomalies([...base, spike], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].transactionId, 'spike-1');
  assert.equal(out[0].amount, 1000);
  assert.match(out[0].reason, /Unusually large Amazon charge/);
});

// ---------- Overdue invoices ----------
test('computeOverdueInvoices — filters and sorts by due date', () => {
  const inv: InvoiceLike[] = [
    { vendor: 'A', amount: 100, status: 'open', dueDate: '2026-08-01' },
    { vendor: 'B', amount: 200, status: 'open', dueDate: '2026-07-01' },
    { vendor: 'C', amount: 300, status: 'paid', dueDate: '2026-07-01' },   // paid → excluded
    { vendor: 'D', amount: 400, status: 'open', dueDate: '2026-09-01' },   // future → excluded
  ];
  const od = computeOverdueInvoices(inv, NOW);
  assert.deepEqual(od.map(i => i.vendor), ['B', 'A']);
});

// ---------- Recommendations ----------
test('computeRecommendations — returns fallback when healthy, caps at 5', () => {
  const k = computeKpis(FIXTURE, [], NOW);
  const recs = computeRecommendations({ kpis: { ...k, expDeltaPct: 0 }, overdue: [], anomalies: [], topVendors: [] });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].id, 'ok');
});

// ---------- Forecast ----------
test('forecastCash — empty inputs ⇒ flat zero series of requested length', () => {
  const f = forecastCash([], [], 90, NOW);
  assert.equal(f.series.length, 90);
  assert.equal(f.startingCash, 0);
  assert.equal(f.endingCash, 0);
  assert.equal(f.scheduledEvents, 0);
});

test('forecastCash — deterministic and lowestDay is a true minimum', () => {
  const invs: InvoiceLike[] = [{ vendor: 'ClientX', invoiceNumber: 'INV-1', amount: 2000, status: 'open', direction: 'receivable', dueDate: '2026-08-20' }];
  const a = forecastCash(FIXTURE, invs, 90, NOW);
  const b = forecastCash(FIXTURE, invs, 90, NOW);
  assert.deepEqual(a, b);
  const minCash = Math.min(...a.series.map(d => d.cash), a.startingCash);
  assert.ok(a.lowestDay.cash <= minCash + 1); // rounding tolerance
  assert.ok(a.scheduledEvents >= 1);          // the receivable is scheduled
});

// ---------- Scenario (must match Enterprise client-side math exactly) ----------
test('applyLinearScenario — exact delta math', () => {
  const forecast = {
    series: [{ day: 'd1', cash: 1000, net: 0 }, { day: 'd2', cash: 1100, net: 0 }, { day: 'd3', cash: 1200, net: 0 }],
    baselineDailyRev: 100, baselineDailyExp: 50,
  };
  const r = applyLinearScenario(forecast, { revPct: 10, expPct: 0 }); // delta = (110-50)-(100-50) = 10
  assert.deepEqual(r.points.map(p => p.scenario), [1010, 1120, 1230]);
  assert.equal(r.baselineEnding, 1200);
  assert.equal(r.scenarioEnding, 1230);
  assert.equal(r.runsOutOfCashOn, null);
});

test('applyLinearScenario — detects cash-out day', () => {
  const forecast = { series: [{ day: 'd1', cash: 50, net: 0 }, { day: 'd2', cash: 20, net: 0 }, { day: 'd3', cash: -5, net: 0 }], baselineDailyRev: 0, baselineDailyExp: 0 };
  const r = applyLinearScenario(forecast, { revPct: 0, expPct: 0 });
  assert.equal(r.runsOutOfCashOn, 'd3');
});

// ---------- Resilience ----------
test('computeResilience — hand-checkable core figures', () => {
  const txs = [
    ...['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-10'].map(d => tx(d, 3000, 'Employer', 'Income')),
    ...['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map(d => tx(d, -1500, 'Landlord', 'Housing')),
    tx('2026-07-28', -300, 'Grocer', 'Groceries'),
  ];
  const r = computeResilience(txs, NOW);
  assert.equal(r.cash, 3000 * 4 - 1500 * 4 - 300); // 5700
  assert.equal(r.avgMonthlyIncome, 4000);          // 12000 in 90d (05-15 is day 89 → included) / 3
  assert.equal(r.avgMonthlyExpense, 1600);         // 4800 in 90d / 3 (3 rents + grocery)
  assert.ok(r.fixedMonthlyCommitments > 1000);     // recurring rent normalized to monthly
  assert.equal(r.incomeStreams, 1);
  assert.equal(r.incomeConcentration, 1);          // single income source
  assert.ok(r.emergencyFundMonths > 3 && r.emergencyFundMonths < 4); // 5700/1600 = 3.6
  const again = computeResilience(txs, NOW);
  assert.deepEqual(r, again);
});
