// Sprint P2 — deterministic unit tests for the personal core module.
// Run: npx tsx --test tests/core/personal.core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePersonalState, computePersonalHealth, computePersonalResilience, computeWhatChanged,
  PERSONAL_CATEGORIES, ESSENTIAL_CATEGORIES,
} from '../../lib/core/finance/personal';
import { TransactionLike } from '../../lib/core/finance/types';

const NOW = new Date('2026-08-26T12:00:00Z');
let seq = 0;
const tx = (date: string, amount: number, vendor: string, category: string): TransactionLike =>
  ({ id: `t${seq++}`, date, description: vendor, vendor, category, amount, currency: 'INR' });

/** Replicates the demo profile: income 2,00,000 · essential 82,000 · lifestyle 32,000 · EMI 18,000 · SIP 25,000. */
function demoLikeFixture(): TransactionLike[] {
  const out: TransactionLike[] = [];
  const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
  for (const m of months) {
    out.push(tx(`${m}-01`, 200000, 'BrightWorks Salary', 'Income'));
    out.push(tx(`${m}-02`, -41820, 'Green Leaf Rent', 'Housing'));           // 51%
    for (const d of ['05', '12', '19', '26']) out.push(tx(`${m}-${d}`, -4510, 'FreshMart', 'Groceries')); // 22%
    out.push(tx(`${m}-08`, -7380, 'City Power', 'Utilities'));               // 9%
    out.push(tx(`${m}-09`, -9020, 'Metro & Fuel', 'Transportation'));        // 11%
    out.push(tx(`${m}-12`, -5740, 'SecureLife', 'Insurance'));               // 7%  → essentials = 82,000
    out.push(tx(`${m}-10`, -6400, 'Spice Route', 'Dining'));
    out.push(tx(`${m}-22`, -6400, 'Spice Route', 'Dining'));
    out.push(tx(`${m}-03`, -3200, 'StreamPlus', 'Subscriptions'));
    out.push(tx(`${m}-15`, -6400, 'PVR', 'Entertainment'));
    out.push(tx(`${m}-18`, -9600, 'UrbanBasket', 'Shopping'));               // lifestyle = 32,000
    out.push(tx(`${m}-07`, -18000, 'HomeLoan EMI', 'Debt'));
    out.push(tx(`${m}-04`, -25000, 'NiftyIndex SIP', 'Investments'));
  }
  // Opening balance so computed cash = exactly 6,50,000
  const generated = out.reduce((s, t) => s + t.amount, 0);
  out.unshift(tx('2026-05-01', 650000 - generated, 'Opening balance', 'Other'));
  return out;
}

test('taxonomy — 14 personal categories, Debt not counted as essential', () => {
  assert.equal(PERSONAL_CATEGORIES.length, 14);
  assert.ok(!ESSENTIAL_CATEGORIES.includes('Debt'));
  assert.ok(!ESSENTIAL_CATEGORIES.includes('Investments'));
});

test('P2.4 Personal State — exact spec figures (income 2L, spend 1.32L, surplus 68K, savings 34%)', () => {
  const s = computePersonalState(demoLikeFixture(), NOW);
  assert.equal(s.income30d, 200000);
  assert.equal(s.spend30d, 132000);        // 82,000 essential + 32,000 lifestyle + 18,000 EMI
  assert.equal(s.investing30d, 25000);     // SIP treated as savings, not spending
  assert.equal(s.surplus30d, 68000);       // spec: "Monthly surplus ₹68,000"
  assert.equal(s.savingsRate, 0.34);
  assert.equal(s.essential30d, 82000);
  assert.equal(s.discretionary30d, 32000);
  assert.equal(s.other30d, 18000);         // Debt payment (shown separately from essential/lifestyle)
  assert.equal(s.cash, 650000);
  assert.equal(s.spendingTrendPct, 0);     // steady months
  assert.ok(s.fixedMonthly > 100000);      // recurring commitments detected
  assert.ok(s.recurringCommitments.length >= 5);
  assert.ok(s.topCategories.every((c: any) => c.category !== 'Investments'));
});

test('P2.6 Resilience — spec figure: ₹6.5L reserve ÷ ₹82K essential = 7.9 months', () => {
  const r = computePersonalResilience(demoLikeFixture(), { monthlyDebtPayment: 18000, now: NOW });
  assert.equal(r.essentialMonthly, 82000);
  assert.equal(r.liquidReserve, 650000);
  assert.equal(r.resilienceMonths, 7.9);
  assert.equal(r.debtMonthly, 18000);
  assert.ok(r.fixedMonthlyCommitments > 50000); // recurring essential bills
});

test('P2.5 Personal Health — transparent 5-factor model, deterministic', () => {
  const s = computePersonalState(demoLikeFixture(), NOW);
  const h = computePersonalHealth(s, { monthlyDebtPayment: 18000 });
  assert.equal(h.factors.length, 5);
  assert.deepEqual(h.factors.map(f => f.key), ['savings_rate', 'emergency_fund', 'debt_pressure', 'income_stability', 'spending_trend']);
  // savings 34% (20) + EF 7.9mo (25) + debt 9% (20) + steady income (20) + steady spend (15) = 100
  assert.equal(h.score, 100);
  assert.equal(h.band, 'thriving');
  assert.ok(h.disclaimer.includes('not a credit score'));
  const again = computePersonalHealth(computePersonalState(demoLikeFixture(), NOW), { monthlyDebtPayment: 18000 });
  assert.deepEqual(h, again);
});

test('Health — weak profile lands in a low band with weak factors', () => {
  const txs = [
    tx('2026-08-01', 50000, 'Gig income', 'Income'),
    tx('2026-08-05', -30000, 'Rent', 'Housing'),
    tx('2026-08-10', -25000, 'Shopping spree', 'Shopping'),
  ];
  const h = computePersonalHealth(computePersonalState(txs, NOW), { monthlyDebtPayment: 30000 });
  assert.ok(h.score < 55);
  assert.ok(['strained', 'at_risk'].includes(h.band));
});

test('P2.7 What changed — steady months surface the positive reserve build-up', () => {
  const changes = computeWhatChanged(demoLikeFixture(), NOW);
  const reserve = changes.find(c => c.kind === 'reserve_change');
  assert.ok(reserve, 'expected a reserve_change entry');
  assert.equal(reserve!.direction, 'up');
  assert.equal(reserve!.tone, 'positive');
  assert.equal(reserve!.amount, 43000); // 200,000 − 132,000 − 25,000 SIP
});

test('P2.7 What changed — dining bump is detected as the biggest category movement', () => {
  const txs = [...demoLikeFixture(), tx('2026-08-20', -4200, 'Spice Route', 'Dining')];
  const changes = computeWhatChanged(txs, NOW);
  const trend = changes.find(c => c.kind === 'spending_trend');
  const cat = changes.find(c => c.kind === 'category_change');
  assert.ok(trend && trend.direction === 'up' && (trend.pct as number) >= 3);
  assert.ok(cat && cat.category === 'Dining' && cat.amount === 4200 && cat.direction === 'up');
});

test('Empty workspace — everything is zero, nothing crashes, no -0 artifacts', () => {
  const s = computePersonalState([], NOW);
  assert.equal(Object.is(s.spend30d, -0), false);
  assert.equal(s.surplus30d, 0);
  assert.equal(s.savingsRate, 0);
  const h = computePersonalHealth(s);
  assert.ok(h.score >= 0 && h.score <= 100);
  const r = computePersonalResilience([], { now: NOW });
  assert.equal(r.resilienceMonths, 0);
  assert.deepEqual(computeWhatChanged([], NOW), []);
});
