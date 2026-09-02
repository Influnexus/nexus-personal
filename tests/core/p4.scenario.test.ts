// Sprint P4 — deterministic unit tests for Personal Decision Simulator.
// Run: npx tsx --test tests/core/p4.scenario.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePersonalScenario, buildScenarioTransactions, classifyVerdict,
  VERDICT_THRESHOLDS, PersonalScenarioLevers,
} from '../../lib/core/finance/scenario-personal';
import { computePersonalState, computePersonalResilience, computePersonalHealth } from '../../lib/core/finance/personal';
import { forecastCash } from '../../lib/core/finance/forecast';
import { TransactionLike } from '../../lib/core/finance/types';

const NOW = new Date('2026-08-26T12:00:00Z');
let seq = 0;
const tx = (date: string, amount: number, vendor: string, category: string): TransactionLike =>
  ({ id: `t${seq++}`, date, description: vendor, vendor, category, amount, currency: 'INR' });

/** Healthy demo fixture: income 2L, essential 82K, lifestyle 32K, EMI 18K, SIP 25K, cash 6.5L */
function healthyFixture(): TransactionLike[] {
  const out: TransactionLike[] = [];
  const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
  for (const m of months) {
    out.push(tx(`${m}-01`, 200000, 'BrightWorks Salary', 'Income'));
    out.push(tx(`${m}-02`, -41820, 'Green Leaf Rent', 'Housing'));
    for (const d of ['05', '12', '19', '26']) out.push(tx(`${m}-${d}`, -4510, 'FreshMart', 'Groceries'));
    out.push(tx(`${m}-08`, -7380, 'City Power', 'Utilities'));
    out.push(tx(`${m}-09`, -9020, 'Metro & Fuel', 'Transportation'));
    out.push(tx(`${m}-12`, -5740, 'SecureLife', 'Insurance'));
    out.push(tx(`${m}-10`, -6400, 'Spice Route', 'Dining'));
    out.push(tx(`${m}-22`, -6400, 'Spice Route', 'Dining'));
    out.push(tx(`${m}-03`, -3200, 'StreamPlus', 'Subscriptions'));
    out.push(tx(`${m}-15`, -6400, 'PVR', 'Entertainment'));
    out.push(tx(`${m}-18`, -9600, 'UrbanBasket', 'Shopping'));
    out.push(tx(`${m}-07`, -18000, 'HomeLoan EMI', 'Debt'));
    out.push(tx(`${m}-04`, -25000, 'NiftyIndex SIP', 'Investments'));
  }
  const generated = out.reduce((s, t) => s + t.amount, 0);
  out.unshift(tx('2026-05-01', 650000 - generated, 'Opening balance', 'Other'));
  return out;
}

// ===========================================================================
// P4.1 — Scenario Engine
// ===========================================================================

test('P4.1 — one-time purchase reduces cash, resilience drops', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 200000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.baseline.cash > result.scenario.cash, 'Cash should decrease');
  assert.equal(result.delta.cash, -200000, 'Cash delta should be exactly -2L');
  assert.ok(result.scenario.resilienceMonths < result.baseline.resilienceMonths, 'Resilience should drop');
  assert.ok(result.scenario.healthScore <= result.baseline.healthScore, 'Health should not improve');
  // One-time purchase is placed outside the 30d spending window, so monthly surplus is unchanged
  assert.equal(result.delta.surplus, 0, 'One-time purchase should not affect monthly surplus');
});

test('P4.1 — income reduction decreases surplus and health', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { incomeChangePct: -50 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.scenario.monthlyIncome < result.baseline.monthlyIncome, 'Income should decrease');
  assert.ok(result.scenario.monthlySurplus < result.baseline.monthlySurplus, 'Surplus should decrease');
  assert.ok(result.delta.surplus < 0, 'Surplus delta should be negative');
  assert.ok(result.delta.health < 0, 'Health should decline');
});

test('P4.1 — income increase improves surplus', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { incomeChangePct: 20 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.scenario.monthlyIncome > result.baseline.monthlyIncome, 'Income should increase');
  assert.ok(result.scenario.monthlySurplus > result.baseline.monthlySurplus, 'Surplus should improve');
});

test('P4.1 — essential spending increase reduces surplus', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { essentialChangePct: 30 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.scenario.monthlySpending > result.baseline.monthlySpending, 'Spending should increase');
  assert.ok(result.delta.surplus < 0, 'Surplus should decrease');
});

test('P4.1 — discretionary spending increase reduces surplus', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { discretionaryChangePct: 50 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.delta.surplus < 0, 'Surplus should decrease with higher lifestyle spending');
});

test('P4.1 — new recurring expense reduces surplus', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { newRecurringExpense: { amount: 20000, label: 'Car EMI' } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.scenario.monthlySpending > result.baseline.monthlySpending, 'Spending should increase');
  assert.ok(result.delta.surplus < 0, 'Surplus should decrease');
});

test('P4.1 — remove recurring expense improves surplus', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { removeRecurringExpense: { vendor: 'StreamPlus' } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  assert.ok(result.delta.surplus >= 0, 'Surplus should improve or stay same');
  assert.ok(result.scenario.monthlySpending <= result.baseline.monthlySpending, 'Spending should decrease');
});

test('P4.1 — additional savings is cash outflow (not spending)', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { additionalSavings: 10000 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  // Additional savings goes to Investments category — treated as savings, not spending
  // So surplus (income - spending) should NOT change, but cash should be lower
  assert.ok(result.scenario.cash < result.baseline.cash, 'Cash should be lower due to investment outflow');
});

// ===========================================================================
// P4.2 — Core Scenario Output
// ===========================================================================

test('P4.2 — result contains baseline, scenario, delta, verdict', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 100000 } }, now: NOW,
  });

  // Baseline
  assert.ok(result.baseline.cash > 0);
  assert.ok(result.baseline.monthlyIncome > 0);
  assert.ok(result.baseline.resilienceMonths > 0);
  assert.ok(result.baseline.healthScore >= 0 && result.baseline.healthScore <= 100);

  // Scenario
  assert.ok(typeof result.scenario.cash === 'number');
  assert.ok(typeof result.scenario.projected90dCash === 'number');

  // Delta
  assert.ok(typeof result.delta.cash === 'number');
  assert.ok(typeof result.delta.resilience === 'number');
  assert.ok(typeof result.delta.health === 'number');

  // Verdict
  assert.ok(['green', 'yellow', 'orange', 'red'].includes(result.verdict.level));
  assert.ok(result.verdict.title.length > 0);
  assert.ok(result.verdict.explanation.length > 0);
});

// ===========================================================================
// P4.6 — Verdict Classification
// ===========================================================================

test('P4.6 — small purchase gets GREEN verdict', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 10000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.equal(result.verdict.level, 'green', 'Small purchase on healthy profile should be green');
});

test('P4.6 — medium purchase (₹2L) gets YELLOW or ORANGE', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 200000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  // ₹2L purchase on ₹6.5L cash → resilience drops from 7.9 to ~5.5mo (2.4mo drop) → ORANGE is correct
  assert.ok(['yellow', 'orange'].includes(result.verdict.level), `Expected yellow/orange, got ${result.verdict.level}`);
});

test('P4.6 — very large purchase gets ORANGE or RED', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 600000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.ok(['orange', 'red'].includes(result.verdict.level), `Expected orange/red for 6L purchase, got ${result.verdict.level}`);
});

test('P4.6 — scenario that causes negative surplus is ORANGE or RED', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { incomeChangePct: -100 }, // zero income
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.ok(['orange', 'red'].includes(result.verdict.level), 'Zero income should be orange/red');
  assert.ok(result.scenario.monthlySurplus < 0, 'Surplus should be negative');
});

test('P4.6 — scenario improving resilience gets GREEN', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { discretionaryChangePct: -50 }, // cut lifestyle 50%
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.equal(result.verdict.level, 'green', 'Reducing spending should be green');
  assert.ok(result.delta.surplus > 0, 'Surplus should improve');
});

// ===========================================================================
// P4.7 — "Make It Safer" alternatives
// ===========================================================================

test('P4.7 — large purchase generates alternatives', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 500000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  // Non-green verdicts should have alternatives
  if (result.verdict.level !== 'green') {
    assert.ok(result.alternatives.length > 0, 'Should have alternatives for risky scenarios');
    assert.ok(result.alternatives.length <= 3, 'Max 3 alternatives');
    for (const alt of result.alternatives) {
      assert.ok(alt.id, 'Alternative must have id');
      assert.ok(alt.title, 'Alternative must have title');
      assert.ok(alt.verdict.level, 'Alternative must have verdict');
      assert.ok(typeof alt.impact.resilienceMonths === 'number', 'Alternative must compute impact');
    }
  }
});

test('P4.7 — alternatives are calculated, not hallucinated', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 400000 } },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });

  for (const alt of result.alternatives) {
    // Each alternative should have concrete, computable impact numbers
    assert.ok(typeof alt.impact.cash === 'number');
    assert.ok(typeof alt.impact.healthScore === 'number');
    assert.ok(typeof alt.impact.resilienceMonths === 'number');
    assert.ok(typeof alt.delta.cash === 'number');
  }
});

// ===========================================================================
// P4.14 — Boundary conditions
// ===========================================================================

test('P4.14 — zero income scenario', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { incomeChangePct: -100 }, now: NOW,
  });
  assert.equal(result.scenario.monthlyIncome, 0, 'Income should be zero');
  assert.ok(result.scenario.monthlySurplus < 0, 'Surplus should be negative');
});

test('P4.14 — zero expenses scenario (discretionary cut 100%)', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { discretionaryChangePct: -100 },
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.ok(result.delta.surplus >= 0, 'Cutting expenses should improve surplus');
  assert.equal(result.verdict.level, 'green');
});

test('P4.14 — empty workspace does not crash', () => {
  const result = evaluatePersonalScenario({
    txs: [], levers: { oneTimePurchase: { amount: 50000 } }, now: NOW,
  });
  assert.ok(result.baseline.cash === 0, 'Empty baseline cash');
  assert.ok(typeof result.verdict.level === 'string');
});

test('P4.14 — very large purchase (> 10x cash)', () => {
  const txs = healthyFixture();
  const result = evaluatePersonalScenario({
    txs, levers: { oneTimePurchase: { amount: 10000000 } }, // 1 Cr
    profile: { monthlyDebtPayment: 18000 }, now: NOW,
  });
  assert.equal(result.verdict.level, 'red', 'Massively exceeding cash should be red');
  assert.ok(result.scenario.cash < 0, 'Cash should go negative');
});

// ===========================================================================
// Enterprise regression
// ===========================================================================

test('Enterprise regression — existing scenario.ts applyLinearScenario unchanged', () => {
  // Import the ENTERPRISE scenario function
  const { applyLinearScenario } = require('../../lib/core/finance/scenario');
  const { forecastCash: fc } = require('../../lib/core/finance/forecast');

  const txs = [
    tx('2026-08-01', 50000, 'ClientA', 'Revenue'),
    tx('2026-08-05', -20000, 'OfficeRent', 'Rent'),
  ];
  const forecast = fc(txs, [], 90, NOW);
  const scenario = applyLinearScenario(forecast, { revPct: -10, expPct: 20 });
  assert.ok(scenario.points.length === 90);
  assert.ok(typeof scenario.baselineEnding === 'number');
  assert.ok(typeof scenario.scenarioEnding === 'number');
});

test('P2/P3 regression — computePersonalState still works', () => {
  const txs = healthyFixture();
  const state = computePersonalState(txs, NOW);
  assert.equal(state.income30d, 200000);
  assert.equal(state.spend30d, 132000);
  assert.equal(state.surplus30d, 68000);
});

test('Verdict thresholds are exported and documented', () => {
  assert.equal(VERDICT_THRESHOLDS.GREEN_MAX_RESILIENCE_DROP, 1);
  assert.equal(VERDICT_THRESHOLDS.GREEN_MAX_HEALTH_DROP, 10);
  assert.equal(VERDICT_THRESHOLDS.YELLOW_MAX_RESILIENCE_DROP, 2);
  assert.equal(VERDICT_THRESHOLDS.YELLOW_MAX_HEALTH_DROP, 20);
  assert.equal(VERDICT_THRESHOLDS.RED_RESILIENCE_FLOOR, 1);
  assert.equal(VERDICT_THRESHOLDS.RED_HEALTH_FLOOR, 40);
  assert.equal(VERDICT_THRESHOLDS.RED_PROJECTED_CASH_FLOOR, 0);
});
