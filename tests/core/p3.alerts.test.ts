// Sprint P3 — deterministic unit tests for alerts + forecast core.
// Run: npx tsx --test tests/core/p3.alerts.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePersonalState, computePersonalResilience, computeWhatChanged,
  ESSENTIAL_CATEGORIES, SAVINGS_CATEGORIES,
} from '../../lib/core/finance/personal';
import { forecastCash } from '../../lib/core/finance/forecast';
import { computeAnomalies } from '../../lib/core/finance/anomalies';
import { computePersonalAlerts, getTopAlerts, ALERT_THRESHOLDS } from '../../lib/core/finance/alerts';
import { TransactionLike } from '../../lib/core/finance/types';

const NOW = new Date('2026-08-26T12:00:00Z');
let seq = 0;
const tx = (date: string, amount: number, vendor: string, category: string): TransactionLike =>
  ({ id: `t${seq++}`, date, description: vendor, vendor, category, amount, currency: 'INR' });

// ---- Fixtures ----

/** Healthy demo profile: income 2L, essential 82K, surplus 68K, resilience 7.9mo */
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

/** Low-resilience profile: low cash, high essential spending */
function lowResilienceFixture(): TransactionLike[] {
  const out: TransactionLike[] = [];
  const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
  for (const m of months) {
    out.push(tx(`${m}-01`, 60000, 'Gig Income', 'Income'));
    out.push(tx(`${m}-05`, -25000, 'Rent', 'Housing'));
    out.push(tx(`${m}-10`, -8000, 'Groceries', 'Groceries'));
    out.push(tx(`${m}-12`, -5000, 'Utilities', 'Utilities'));
    out.push(tx(`${m}-15`, -4000, 'Transport', 'Transportation'));
    out.push(tx(`${m}-20`, -15000, 'Shopping', 'Shopping'));
  }
  // Very low cash: only ~12,000
  const generated = out.reduce((s, t) => s + t.amount, 0);
  out.unshift(tx('2026-05-01', 12000 - generated, 'Opening balance', 'Other'));
  return out;
}

/** Spending-surge profile: spending jumps 30% in the current month */
function spendingSurgeFixture(): TransactionLike[] {
  const out: TransactionLike[] = [];
  // Base months — moderate spending
  for (const m of ['2026-06', '2026-07']) {
    out.push(tx(`${m}-01`, 150000, 'Salary', 'Income'));
    out.push(tx(`${m}-05`, -30000, 'Rent', 'Housing'));
    out.push(tx(`${m}-10`, -8000, 'Groceries', 'Groceries'));
    out.push(tx(`${m}-15`, -5000, 'Dining', 'Dining'));
    out.push(tx(`${m}-20`, -7000, 'Entertainment', 'Entertainment'));
  }
  // August — spending surges
  out.push(tx('2026-08-01', 150000, 'Salary', 'Income'));
  out.push(tx('2026-08-05', -30000, 'Rent', 'Housing'));
  out.push(tx('2026-08-10', -12000, 'Groceries', 'Groceries'));     // +50%
  out.push(tx('2026-08-15', -15000, 'Dining', 'Dining'));           // +200%
  out.push(tx('2026-08-18', -20000, 'Luxury Purchase', 'Shopping')); // new
  out.push(tx('2026-08-20', -10000, 'Entertainment', 'Entertainment')); // +43%

  const generated = out.reduce((s, t) => s + t.amount, 0);
  out.unshift(tx('2026-06-01', 500000 - generated, 'Opening balance', 'Other'));
  return out;
}

// ===========================================================================
// P3.4 Alert Engine Tests
// ===========================================================================

test('P3.4 — healthy profile generates no critical or warning alerts', () => {
  const txs = healthyFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { monthlyDebtPayment: 18000, now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const anomalies = computeAnomalies(txs, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, anomalies, currency: 'INR', now: NOW });
  
  const critical = alerts.filter(a => a.severity === 'critical');
  const warning = alerts.filter(a => a.severity === 'warning');
  assert.equal(critical.length, 0, 'Healthy profile should have no critical alerts');
  assert.equal(warning.length, 0, 'Healthy profile should have no warning alerts');
});

test('P3.4 — low resilience triggers LOW_RESILIENCE alert', () => {
  const txs = lowResilienceFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  const lowRes = alerts.find(a => a.type === 'LOW_RESILIENCE');
  assert.ok(lowRes, 'Expected LOW_RESILIENCE alert for low-reserve profile');
  assert.ok(['critical', 'warning'].includes(lowRes!.severity), 'Should be critical or warning');
});

test('P3.4 — spending surge triggers SPENDING_INCREASE alert', () => {
  const txs = spendingSurgeFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  const spendAlert = alerts.find(a => a.type === 'SPENDING_INCREASE');
  assert.ok(spendAlert, 'Expected SPENDING_INCREASE alert for spending-surge profile');
  assert.ok(spendAlert!.metric?.includes('+'), 'Should show positive % change');
});

test('P3.5 — severity classification: CRITICAL > WARNING > INFO sort order', () => {
  const txs = lowResilienceFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  // Verify sort order
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < alerts.length; i++) {
    assert.ok(
      severityOrder[alerts[i].severity] >= severityOrder[alerts[i - 1].severity],
      `Alert ${i} (${alerts[i].severity}) should not precede alert ${i-1} (${alerts[i - 1].severity})`
    );
  }
});

test('P3.8 — duplicate alert prevention', () => {
  const txs = lowResilienceFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  // No two alerts should have the same type+context
  const keys = alerts.map(a => `${a.type}:${a.context || ''}`);
  const unique = new Set(keys);
  assert.equal(keys.length, unique.size, 'Should not have duplicate alerts');
});

test('P3.6 — getTopAlerts returns at most 3 alerts', () => {
  const txs = lowResilienceFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });
  
  const top = getTopAlerts(alerts, 3);
  assert.ok(top.length <= 3, `Top alerts should be at most 3, got ${top.length}`);
});

test('P3.4 — every alert has required fields', () => {
  const txs = lowResilienceFixture();
  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  for (const alert of alerts) {
    assert.ok(alert.id, 'Alert must have id');
    assert.ok(alert.type, 'Alert must have type');
    assert.ok(['critical', 'warning', 'info'].includes(alert.severity), 'Alert must have valid severity');
    assert.ok(alert.title, 'Alert must have title');
    assert.ok(alert.explanation, 'Alert must have explanation');
    assert.ok(alert.timestamp, 'Alert must have timestamp');
  }
});

test('P3.8 — no alerts for tiny fluctuations (noise prevention)', () => {
  // Create profile with very small spending changes
  const txs: TransactionLike[] = [];
  for (const m of ['2026-07', '2026-08']) {
    txs.push(tx(`${m}-01`, 100000, 'Salary', 'Income'));
    txs.push(tx(`${m}-05`, -30000, 'Rent', 'Housing'));
    txs.push(tx(`${m}-10`, -10000, 'Groceries', 'Groceries'));
  }
  // Add a ₹200 fluctuation — should NOT trigger an alert
  txs.push(tx('2026-08-15', -200, 'Coffee', 'Dining'));
  const generated = txs.reduce((s, t) => s + t.amount, 0);
  txs.unshift(tx('2026-07-01', 500000 - generated, 'Opening balance', 'Other'));

  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const forecast = forecastCash(txs, [], 90, NOW);
  const alerts = computePersonalAlerts({ state, resilience, forecast, currency: 'INR', now: NOW });

  const spendAlert = alerts.find(a => a.type === 'SPENDING_INCREASE');
  // Spending only increased by a tiny amount — should not trigger
  assert.ok(!spendAlert || spendAlert.severity === 'info', 'Small fluctuations should not trigger spending warnings');
});

test('P3.8 — SAVINGS_IMPROVED alert fires when spending drops and savings positive', () => {
  const txs: TransactionLike[] = [];
  // Month 1: high spending
  txs.push(tx('2026-07-01', 200000, 'Salary', 'Income'));
  txs.push(tx('2026-07-05', -60000, 'Rent', 'Housing'));
  txs.push(tx('2026-07-10', -40000, 'Groceries', 'Groceries'));
  txs.push(tx('2026-07-15', -30000, 'Dining', 'Dining'));
  txs.push(tx('2026-07-20', -50000, 'Shopping', 'Shopping'));
  // Month 2: much less spending
  txs.push(tx('2026-08-01', 200000, 'Salary', 'Income'));
  txs.push(tx('2026-08-05', -60000, 'Rent', 'Housing'));
  txs.push(tx('2026-08-10', -30000, 'Groceries', 'Groceries'));
  txs.push(tx('2026-08-15', -10000, 'Dining', 'Dining'));
  const generated = txs.reduce((s, t) => s + t.amount, 0);
  txs.unshift(tx('2026-07-01', 500000 - generated, 'Opening balance', 'Other'));

  const state = computePersonalState(txs, NOW);
  const resilience = computePersonalResilience(txs, { now: NOW });
  const alerts = computePersonalAlerts({ state, resilience, currency: 'INR', now: NOW });

  const improved = alerts.find(a => a.type === 'SAVINGS_IMPROVED');
  assert.ok(improved, 'Expected SAVINGS_IMPROVED alert when spending drops significantly');
  assert.equal(improved!.severity, 'info');
});

// ===========================================================================
// P3.1 Forecast Tests
// ===========================================================================

test('P3.1 — forecastCash produces 90-day series from personal transactions', () => {
  const txs = healthyFixture();
  const forecast = forecastCash(txs, [], 90, NOW);
  assert.equal(forecast.series.length, 90, 'Should have 90 data points');
  assert.ok(forecast.startingCash > 0, 'Starting cash should be positive');
  assert.ok(forecast.endingCash > 0, 'Healthy profile should have positive ending cash');
  assert.ok(forecast.narrative.length > 0, 'Should have a narrative');
});

test('P3.1 — forecast distinguishes recurring patterns', () => {
  const txs = healthyFixture();
  const forecast = forecastCash(txs, [], 90, NOW);
  // Should detect recurring patterns (salary, rent, etc.)
  let hasRecurring = false;
  for (const day of forecast.series) {
    if (day.drivers?.some(d => d.kind === 'recurring_revenue' || d.kind === 'recurring_expense')) {
      hasRecurring = true;
      break;
    }
  }
  assert.ok(hasRecurring, 'Forecast should include detected recurring patterns');
});

test('P3.1 — forecast lowest day is tracked', () => {
  const txs = healthyFixture();
  const forecast = forecastCash(txs, [], 90, NOW);
  assert.ok(forecast.lowestDay.day, 'Should identify lowest cash day');
  assert.ok(typeof forecast.lowestDay.cash === 'number', 'Lowest cash should be a number');
});

// ===========================================================================
// P3.9 What Changed improvement
// ===========================================================================

test('P3.9 — what changed includes savings rate change for shifted profiles', () => {
  const txs: TransactionLike[] = [];
  // Month 1: low savings (high spending)
  txs.push(tx('2026-07-01', 100000, 'Salary', 'Income'));
  txs.push(tx('2026-07-05', -45000, 'Rent', 'Housing'));
  txs.push(tx('2026-07-10', -20000, 'Groceries', 'Groceries'));
  txs.push(tx('2026-07-15', -30000, 'Shopping', 'Shopping'));
  // Month 2: higher savings (spending dropped)
  txs.push(tx('2026-08-01', 100000, 'Salary', 'Income'));
  txs.push(tx('2026-08-05', -45000, 'Rent', 'Housing'));
  txs.push(tx('2026-08-10', -10000, 'Groceries', 'Groceries'));

  // Opening balance placed BEFORE the 60-day window so it doesn't inflate prior income
  const generated = txs.reduce((s, t) => s + t.amount, 0);
  txs.unshift(tx('2026-06-01', 300000 - generated, 'Opening balance', 'Other'));

  const changes = computeWhatChanged(txs, NOW);
  const srChange = changes.find(c => c.kind === 'savings_rate_change');
  assert.ok(srChange, 'Expected savings_rate_change when savings rate shifts significantly');
  assert.equal(srChange!.direction, 'up');
  assert.equal(srChange!.tone, 'positive');
});

// ===========================================================================
// Empty / new workspace
// ===========================================================================

test('P3 — empty workspace: no alerts, no crashes', () => {
  const state = computePersonalState([], NOW);
  const resilience = computePersonalResilience([], { now: NOW });
  const alerts = computePersonalAlerts({ state, resilience, currency: 'INR', now: NOW });
  assert.ok(Array.isArray(alerts), 'Should return an array');
  assert.equal(alerts.length, 0, 'Empty workspace should have no alerts');
});

test('P3 — empty workspace: forecast still works', () => {
  const forecast = forecastCash([], [], 90, NOW);
  assert.equal(forecast.series.length, 90);
  assert.equal(forecast.startingCash, 0);
});

// ===========================================================================
// Enterprise regression — shared core unchanged
// ===========================================================================

test('Enterprise regression — forecastCash signature unchanged', () => {
  // Ensure the enterprise function signature still works with invoices
  const txs = [
    tx('2026-08-01', 50000, 'ClientA', 'Revenue'),
    tx('2026-08-05', -20000, 'OfficeRent', 'Rent'),
  ];
  const invoices = [
    { vendor: 'ClientB', amount: 30000, status: 'open', direction: 'receivable', dueDate: '2026-09-01' },
  ];
  const result = forecastCash(txs, invoices, 90, NOW);
  assert.equal(result.series.length, 90);
  assert.ok(result.scheduledEvents >= 0);
});

test('Thresholds are documented and accessible', () => {
  assert.ok(ALERT_THRESHOLDS.RESILIENCE_CRITICAL_MONTHS === 1);
  assert.ok(ALERT_THRESHOLDS.RESILIENCE_WARNING_MONTHS === 3);
  assert.ok(ALERT_THRESHOLDS.SPENDING_INCREASE_WARNING_PCT === 12);
  assert.ok(ALERT_THRESHOLDS.SPENDING_INCREASE_CRITICAL_PCT === 25);
  assert.ok(ALERT_THRESHOLDS.CATEGORY_MIN_FLOOR === 2000);
});
