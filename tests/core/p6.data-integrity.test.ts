// P6 — Data-integrity: canonical profile-derived state + Financial Freedom (deterministic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePersonalStateFromProfile, computeFinancialFreedom, FI_DEFAULT_MULTIPLIER } from '../../lib/core/finance';

// The exact profile from the production bug report.
const PROFILE = {
  monthlyIncome: 100000,
  essentialMonthly: 45000,
  discretionaryMonthly: 20000,
  cash: 300000,
  monthlyDebtPayment: 0,
  sipMonthly: 0,
};

test('P6.1 canonical state derives EXACTLY from the profile (surplus 35000, rate 35%)', () => {
  const s = computePersonalStateFromProfile(PROFILE);
  assert.equal(s.income30d, 100000);
  assert.equal(s.spend30d, 65000);          // essential 45000 + lifestyle 20000
  assert.equal(s.surplus30d, 35000);        // 100000 - 65000
  assert.equal(s.savingsRate, 0.35);
  assert.equal(s.essential30d, 45000);
  assert.equal(s.discretionary30d, 20000);
  assert.equal(s.cash, 300000);
});

test('P6.2 profile-only state exposes NO fabricated transaction analytics', () => {
  const s = computePersonalStateFromProfile(PROFILE);
  assert.deepEqual(s.topCategories, []);
  assert.deepEqual(s.recurringCommitments, []);
  assert.equal(s.transactionCount, 0);
  assert.equal(s.spendingTrendPct, 0);
});

test('P6.3 debt reduces surplus and is counted in fixed commitments', () => {
  const s = computePersonalStateFromProfile({ ...PROFILE, monthlyDebtPayment: 10000 });
  assert.equal(s.spend30d, 75000);          // 45000 + 20000 + 10000
  assert.equal(s.surplus30d, 25000);
  assert.equal(s.fixedMonthly, 55000);      // essential 45000 + debt 10000
  assert.equal(s.variableMonthly, 20000);   // discretionary
});

test('P6.4 Financial Freedom: FI target = essential x 12 x 25', () => {
  const fi = computeFinancialFreedom({
    essentialMonthly: 45000, monthlySurplus: 35000, monthlyIncome: 100000,
    cash: 300000, investments: 500000,
  });
  assert.equal(fi.multiplier, FI_DEFAULT_MULTIPLIER);
  assert.equal(fi.essentialAnnual, 540000);
  assert.equal(fi.fiTarget, 13500000);            // 540000 * 25
  assert.equal(fi.currentAssets, 800000);         // 300000 + 500000
  assert.equal(fi.fiGap, 12700000);               // 13500000 - 800000
  // progress = 800000 / 13500000 = 5.925...%
  assert.ok(Math.abs(fi.fiProgressPct - 5.93) < 0.05, `progress ${fi.fiProgressPct}`);
});

test('P6.5 FI trajectory is null when there is no surplus (not progressing)', () => {
  const fi = computeFinancialFreedom({
    essentialMonthly: 45000, monthlySurplus: 0, monthlyIncome: 65000,
    cash: 100000, investments: 0,
  });
  assert.equal(fi.monthsToFI, null);
  assert.equal(fi.yearsToFI, null);
  assert.equal(fi.status, 'not_progressing');
});

test('P6.6 FI trajectory computed deterministically from surplus (0% return baseline)', () => {
  const fi = computeFinancialFreedom({
    essentialMonthly: 45000, monthlySurplus: 35000, monthlyIncome: 100000,
    cash: 300000, investments: 500000,
  });
  // gap 12,700,000 / 35,000 = 362.857 -> ceil 363 months
  assert.equal(fi.monthsToFI, 363);
  assert.equal(fi.yearsToFI, 30.25);
});

test('P6.7 User A vs User B produce different, independent results (isolation of math)', () => {
  const a = computePersonalStateFromProfile(PROFILE);
  const b = computePersonalStateFromProfile({ monthlyIncome: 250000, essentialMonthly: 90000, discretionaryMonthly: 40000, cash: 1200000, monthlyDebtPayment: 15000, sipMonthly: 0 });
  assert.equal(a.surplus30d, 35000);
  assert.equal(b.surplus30d, 250000 - (90000 + 40000 + 15000)); // 105000
  assert.notEqual(a.income30d, b.income30d);
  assert.notEqual(a.cash, b.cash);
});

test('P6.8 empty profile yields all zeros (no crash, no fabricated data)', () => {
  const s = computePersonalStateFromProfile({ monthlyIncome: 0, essentialMonthly: 0, discretionaryMonthly: 0, cash: 0 });
  assert.equal(s.income30d, 0);
  assert.equal(s.surplus30d, 0);
  assert.equal(s.savingsRate, 0);
  assert.deepEqual(s.topCategories, []);
});

import { evaluatePersonalScenario } from '../../lib/core/finance';

test('P6.9 scenario baseline is rebased to the canonical profile state (exact, no window drift)', () => {
  const base = computePersonalStateFromProfile(PROFILE); // surplus 35000, cash 300000
  // A tiny/empty tx set would give a different windowed baseline; baseState forces canonical values.
  const res = evaluatePersonalScenario({
    txs: [
      { date: new Date().toISOString().slice(0,10), amount: 90000, category: 'Salary', vendor: 'Employer', currency: 'INR' } as any,
      { date: new Date().toISOString().slice(0,10), amount: -30000, category: 'Rent', vendor: 'Landlord', currency: 'INR' } as any,
      { date: new Date().toISOString().slice(0,10), amount: -5000, category: 'Groceries', vendor: 'Store', currency: 'INR' } as any,
    ],
    levers: { oneTimePurchase: { amount: 200000, label: 'Laptop' } },
    baseState: { cash: base.cash, income30d: base.income30d, spend30d: base.spend30d, surplus30d: base.surplus30d },
  });
  assert.equal(res.baseline.monthlySurplus, 35000);
  assert.equal(res.baseline.monthlyIncome, 100000);
  assert.equal(res.baseline.monthlySpending, 65000);
  assert.equal(res.baseline.cash, 300000);
  // one-time purchase reduces cash by 200000 on the scenario side
  assert.equal(res.scenario.cash, 100000);
  assert.equal(res.delta.cash, -200000);
});
