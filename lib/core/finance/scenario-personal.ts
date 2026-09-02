// ============================================================================================
// Shared core — Personal Decision Simulator (Sprint P4). Pure, deterministic, no LLM.
//
// ARCHITECTURE:
//   1. Take current transactions + scenario levers
//   2. Build VIRTUAL modified transaction set (never mutates DB)
//   3. Run the SAME pure functions (state, health, resilience, forecast) on both sets
//   4. Compare baseline vs scenario → delta + verdict + alternatives
//
// SUPPORTED LEVERS:
//   1. incomeChangePct / incomeChangeAbsolute — modify recurring income
//   2. essentialChangePct / essentialChangeAbsolute — modify essential spending
//   3. discretionaryChangePct / discretionaryChangeAbsolute — modify lifestyle spending
//   4. oneTimePurchase { amount, date } — large purchase
//   5. newRecurringExpense { amount, label } — new monthly commitment
//   6. removeRecurringExpense { vendor } — cancel a recurring payment
//   7. additionalSavings — extra monthly cash outflow (investment)
//
// VERDICT CLASSIFICATION (deterministic):
//   GREEN  — healthy impact (resilience drops < 1mo, health drops < 10)
//   YELLOW — manageable (resilience drops 1-2mo OR health drops 10-20, surplus stays ≥ 0)
//   ORANGE — significant risk (resilience drops > 2mo OR health drops > 20 OR surplus < 0)
//   RED    — high risk (resilience < 1mo after OR health < 40 OR projected cash < 0)
// ============================================================================================

import { TransactionLike, dateKey, addDays, daysAgoFrom, sum } from './types';
import {
  computePersonalState, computePersonalHealth, computePersonalResilience,
  PersonalState, PersonalHealth, PersonalResilience,
  ESSENTIAL_CATEGORIES, DISCRETIONARY_CATEGORIES, SAVINGS_CATEGORIES,
} from './personal';
import { forecastCash, ForecastResult } from './forecast';
import type { PersonalProfile } from '@/lib/db/models';

// ---- Types ----

export interface PersonalScenarioLevers {
  incomeChangePct?: number;           // e.g., -20 = income drops 20%
  incomeChangeAbsolute?: number;      // e.g., +10000 = +₹10K/mo on top of current
  essentialChangePct?: number;        // e.g., +15 = essentials rise 15%
  essentialChangeAbsolute?: number;   // e.g., +18000 = ₹18K/mo more essentials
  discretionaryChangePct?: number;
  discretionaryChangeAbsolute?: number;
  oneTimePurchase?: { amount: number; date?: string };
  newRecurringExpense?: { amount: number; label?: string };
  removeRecurringExpense?: { vendor: string };
  additionalSavings?: number;         // extra monthly investment (cash outflow)
}

export interface ScenarioSnapshot {
  cash: number;
  monthlyIncome: number;
  monthlySpending: number;
  monthlySurplus: number;
  resilienceMonths: number;
  healthScore: number;
  healthBand: string;
  projected90dCash: number;
}

export interface ScenarioDelta {
  cash: number;
  surplus: number;
  resilience: number;
  health: number;
  projected90dCash: number;
}

export type VerdictLevel = 'green' | 'yellow' | 'orange' | 'red';

export interface ScenarioVerdict {
  level: VerdictLevel;
  title: string;
  explanation: string;
}

export interface ScenarioAlternative {
  id: string;
  title: string;
  description: string;
  modifiedLevers: Partial<PersonalScenarioLevers>;
  impact: ScenarioSnapshot;
  delta: ScenarioDelta;
  verdict: ScenarioVerdict;
}

export interface PersonalScenarioResult {
  baseline: ScenarioSnapshot;
  scenario: ScenarioSnapshot;
  delta: ScenarioDelta;
  verdict: ScenarioVerdict;
  alternatives: ScenarioAlternative[];
  leversApplied: PersonalScenarioLevers;
}

export interface PersonalScenarioInput {
  txs: TransactionLike[];
  levers: PersonalScenarioLevers;
  profile?: { monthlyDebtPayment?: number };
  now?: Date;
}

// ---- Verdict thresholds (exported, documented, deterministic) ----

export const VERDICT_THRESHOLDS = {
  // GREEN: minor impact
  GREEN_MAX_RESILIENCE_DROP: 1,     // months
  GREEN_MAX_HEALTH_DROP: 10,        // points

  // YELLOW: manageable
  YELLOW_MAX_RESILIENCE_DROP: 2,    // months
  YELLOW_MAX_HEALTH_DROP: 20,       // points

  // RED absolute triggers (regardless of delta)
  RED_RESILIENCE_FLOOR: 1,          // < 1 month after = RED
  RED_HEALTH_FLOOR: 40,             // < 40 after = RED
  RED_PROJECTED_CASH_FLOOR: 0,      // negative projected cash = RED
} as const;

// ---- Build modified transaction set ----

export function buildScenarioTransactions(
  txs: TransactionLike[],
  levers: PersonalScenarioLevers,
  now: Date = new Date(),
): TransactionLike[] {
  let result = [...txs]; // shallow copy — never mutate originals
  const today = dateKey(now);
  let syntheticId = 900000;
  const sid = () => `scenario-${syntheticId++}`;

  // 1. Income change (modify positive transactions in the last 30 days + future-project)
  if (levers.incomeChangePct != null && levers.incomeChangePct !== 0) {
    const factor = 1 + levers.incomeChangePct / 100;
    result = result.map(t => t.amount > 0 && t.category === 'Income'
      ? { ...t, amount: Math.round(t.amount * factor) }
      : t
    );
  }
  if (levers.incomeChangeAbsolute != null && levers.incomeChangeAbsolute !== 0) {
    // Distribute absolute change across existing income transactions in last 30d
    const d30 = daysAgoFrom(now, 30);
    const incTxs = result.filter(t => t.amount > 0 && t.category === 'Income' && new Date(t.date) >= d30);
    if (incTxs.length > 0) {
      const perTx = Math.round(levers.incomeChangeAbsolute / incTxs.length);
      const incIds = new Set(incTxs.map(t => t.id));
      result = result.map(t => incIds.has(t.id) ? { ...t, amount: t.amount + perTx } : t);
    }
  }

  // 2. Essential spending change
  if (levers.essentialChangePct != null && levers.essentialChangePct !== 0) {
    const factor = 1 + levers.essentialChangePct / 100;
    result = result.map(t =>
      t.amount < 0 && ESSENTIAL_CATEGORIES.includes(t.category)
        ? { ...t, amount: Math.round(t.amount * factor) }
        : t
    );
  }
  if (levers.essentialChangeAbsolute != null && levers.essentialChangeAbsolute !== 0) {
    // Add the absolute change as a monthly synthetic transaction
    const months = 4; // cover the window for state/resilience calculations
    for (let m = 0; m < months; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      result.push({
        id: sid(), date: dateKey(d), description: 'Scenario: essential change',
        vendor: 'Scenario Essential Adj', category: 'Housing',
        amount: -Math.abs(levers.essentialChangeAbsolute), currency: txs[0]?.currency || 'INR',
      });
    }
  }

  // 3. Discretionary spending change
  if (levers.discretionaryChangePct != null && levers.discretionaryChangePct !== 0) {
    const factor = 1 + levers.discretionaryChangePct / 100;
    result = result.map(t =>
      t.amount < 0 && DISCRETIONARY_CATEGORIES.includes(t.category)
        ? { ...t, amount: Math.round(t.amount * factor) }
        : t
    );
  }
  if (levers.discretionaryChangeAbsolute != null && levers.discretionaryChangeAbsolute !== 0) {
    const months = 4;
    for (let m = 0; m < months; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      result.push({
        id: sid(), date: dateKey(d), description: 'Scenario: discretionary change',
        vendor: 'Scenario Discretionary Adj', category: 'Shopping',
        amount: -Math.abs(levers.discretionaryChangeAbsolute), currency: txs[0]?.currency || 'INR',
      });
    }
  }

  // 4. One-time purchase — placed BEFORE the 30-day spending window so it reduces
  //    total cash without inflating monthly spending patterns. This correctly models
  //    "what happens to my ongoing financial health if I make this purchase."
  if (levers.oneTimePurchase && levers.oneTimePurchase.amount > 0) {
    // Place 60 days ago so it's outside the 30d spending window but inside the total cash sum
    const purchaseDate = dateKey(daysAgoFrom(now, 60));
    result.push({
      id: sid(), date: purchaseDate, description: 'Scenario: one-time purchase',
      vendor: 'Scenario Purchase', category: 'Other',
      amount: -Math.abs(levers.oneTimePurchase.amount), currency: txs[0]?.currency || 'INR',
    });
  }

  // 5. New recurring expense — insert monthly transactions for the last 4 months
  if (levers.newRecurringExpense && levers.newRecurringExpense.amount > 0) {
    const label = levers.newRecurringExpense.label || 'New commitment';
    const months = 4;
    for (let m = 0; m < months; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      result.push({
        id: sid(), date: dateKey(d), description: `Scenario: ${label}`,
        vendor: `Scenario: ${label}`, category: 'Other',
        amount: -Math.abs(levers.newRecurringExpense.amount), currency: txs[0]?.currency || 'INR',
      });
    }
  }

  // 6. Remove recurring expense — filter out vendor's transactions
  if (levers.removeRecurringExpense?.vendor) {
    const vendorLower = levers.removeRecurringExpense.vendor.toLowerCase();
    result = result.filter(t => t.vendor.toLowerCase() !== vendorLower);
  }

  // 7. Additional savings (cash outflow — modeled as investment)
  if (levers.additionalSavings && levers.additionalSavings > 0) {
    const months = 4;
    for (let m = 0; m < months; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      result.push({
        id: sid(), date: dateKey(d), description: 'Scenario: additional savings',
        vendor: 'Scenario: Additional Savings', category: 'Investments',
        amount: -Math.abs(levers.additionalSavings), currency: txs[0]?.currency || 'INR',
      });
    }
  }

  return result;
}

// ---- Compute snapshot from transactions ----

function computeSnapshot(
  txs: TransactionLike[],
  profile?: { monthlyDebtPayment?: number },
  now?: Date,
): ScenarioSnapshot {
  const state = computePersonalState(txs, now);
  const health = computePersonalHealth(state, profile);
  const resilience = computePersonalResilience(txs, { monthlyDebtPayment: profile?.monthlyDebtPayment, now });
  const forecast = txs.length >= 3 ? forecastCash(txs, [], 90, now) : null;

  return {
    cash: state.cash,
    monthlyIncome: state.income30d,
    monthlySpending: state.spend30d,
    monthlySurplus: state.surplus30d,
    resilienceMonths: resilience.resilienceMonths,
    healthScore: health.score,
    healthBand: health.band,
    projected90dCash: forecast?.endingCash ?? state.cash,
  };
}

// ---- Verdict classification ----

export function classifyVerdict(baseline: ScenarioSnapshot, scenario: ScenarioSnapshot, delta: ScenarioDelta): ScenarioVerdict {
  const T = VERDICT_THRESHOLDS;

  // RED absolute triggers
  if (scenario.resilienceMonths < T.RED_RESILIENCE_FLOOR) {
    return { level: 'red', title: 'High financial risk', explanation: `This would leave your reserve at ${scenario.resilienceMonths} months — below the minimum safety level. Consider alternatives before proceeding.` };
  }
  if (scenario.healthScore < T.RED_HEALTH_FLOOR) {
    return { level: 'red', title: 'High financial risk', explanation: `Your Financial Health would drop to ${scenario.healthScore}/100, which signals significant financial strain. Consider a smaller commitment or building your reserve first.` };
  }
  if (scenario.projected90dCash < T.RED_PROJECTED_CASH_FLOOR) {
    return { level: 'red', title: 'High financial risk', explanation: 'Your projected cash position would go negative within 90 days. This decision is not currently sustainable at the given level.' };
  }

  const resDrop = Math.max(0, -delta.resilience);
  const healthDrop = Math.max(0, -delta.health);

  // ORANGE
  if (resDrop > T.YELLOW_MAX_RESILIENCE_DROP || healthDrop > T.YELLOW_MAX_HEALTH_DROP || scenario.monthlySurplus < 0) {
    return { level: 'orange', title: 'Significant impact', explanation: `This would reduce your resilience by ${resDrop.toFixed(1)} months and your health score by ${healthDrop} points. ${scenario.monthlySurplus < 0 ? 'Your monthly surplus would turn negative.' : ''} Proceed with caution.` };
  }

  // YELLOW
  if (resDrop > T.GREEN_MAX_RESILIENCE_DROP || healthDrop > T.GREEN_MAX_HEALTH_DROP) {
    return { level: 'yellow', title: 'Manageable impact', explanation: `Your resilience would drop by ${resDrop.toFixed(1)} months and health by ${healthDrop} points. This is manageable if you maintain your current income and spending patterns.` };
  }

  // GREEN
  return { level: 'green', title: 'Healthy impact', explanation: 'This decision has minimal impact on your financial position. Your resilience and health remain strong.' };
}

// ---- "Make It Safer" alternatives ----

function generateAlternatives(
  txs: TransactionLike[],
  levers: PersonalScenarioLevers,
  baseline: ScenarioSnapshot,
  profile?: { monthlyDebtPayment?: number },
  now?: Date,
): ScenarioAlternative[] {
  const alts: ScenarioAlternative[] = [];

  // Only generate alternatives for one-time purchases (the primary "Can I afford it?" flow)
  if (levers.oneTimePurchase && levers.oneTimePurchase.amount > 0) {
    const amount = levers.oneTimePurchase.amount;

    // Alt 1: Reduce purchase by 25%
    const reduced = Math.round(amount * 0.75);
    const reducedLevers: PersonalScenarioLevers = { oneTimePurchase: { amount: reduced, date: levers.oneTimePurchase.date } };
    const reducedTxs = buildScenarioTransactions(txs, reducedLevers, now);
    const reducedSnap = computeSnapshot(reducedTxs, profile, now);
    const reducedDelta = computeDelta(baseline, reducedSnap);
    alts.push({
      id: 'reduce_25pct',
      title: `Reduce to ₹${reduced.toLocaleString('en-IN')}`,
      description: `Spend 25% less — choose a more affordable option.`,
      modifiedLevers: reducedLevers,
      impact: reducedSnap,
      delta: reducedDelta,
      verdict: classifyVerdict(baseline, reducedSnap, reducedDelta),
    });

    // Alt 2: Cut discretionary spending 30% temporarily
    const cutLevers: PersonalScenarioLevers = {
      ...levers,
      discretionaryChangePct: -30,
    };
    const cutTxs = buildScenarioTransactions(txs, cutLevers, now);
    const cutSnap = computeSnapshot(cutTxs, profile, now);
    const cutDelta = computeDelta(baseline, cutSnap);
    alts.push({
      id: 'cut_discretionary',
      title: 'Reduce lifestyle spending 30%',
      description: `Temporarily cut dining, entertainment, and shopping to offset the purchase.`,
      modifiedLevers: cutLevers,
      impact: cutSnap,
      delta: cutDelta,
      verdict: classifyVerdict(baseline, cutSnap, cutDelta),
    });

    // Alt 3: Wait and save (add extra savings for N weeks)
    if (baseline.monthlySurplus > 0) {
      const weeksToSave = Math.max(4, Math.ceil(amount / (baseline.monthlySurplus / 4)));
      const futureDate = dateKey(addDays(now || new Date(), weeksToSave * 7));
      const waitLevers: PersonalScenarioLevers = { oneTimePurchase: { amount, date: futureDate } };
      const waitTxs = buildScenarioTransactions(txs, waitLevers, now);
      const waitSnap = computeSnapshot(waitTxs, profile, now);
      const waitDelta = computeDelta(baseline, waitSnap);
      alts.push({
        id: 'wait_and_save',
        title: `Wait ${weeksToSave} weeks`,
        description: `Save up first — your surplus of ₹${baseline.monthlySurplus.toLocaleString('en-IN')}/mo builds a buffer.`,
        modifiedLevers: waitLevers,
        impact: waitSnap,
        delta: waitDelta,
        verdict: classifyVerdict(baseline, waitSnap, waitDelta),
      });
    }
  }

  // For income reduction scenarios, suggest building a buffer first
  if (levers.incomeChangePct != null && levers.incomeChangePct < -10) {
    // Alt: Reduce discretionary first
    const cutLevers: PersonalScenarioLevers = {
      ...levers,
      discretionaryChangePct: -40,
    };
    const cutTxs = buildScenarioTransactions(txs, cutLevers, now);
    const cutSnap = computeSnapshot(cutTxs, profile, now);
    const cutDelta = computeDelta(baseline, cutSnap);
    alts.push({
      id: 'cut_and_reduce',
      title: 'Also cut lifestyle spending 40%',
      description: 'Reduce discretionary spending to compensate for lower income.',
      modifiedLevers: cutLevers,
      impact: cutSnap,
      delta: cutDelta,
      verdict: classifyVerdict(baseline, cutSnap, cutDelta),
    });
  }

  return alts.slice(0, 3); // max 3 alternatives
}

// ---- Delta computation ----

function computeDelta(baseline: ScenarioSnapshot, scenario: ScenarioSnapshot): ScenarioDelta {
  return {
    cash: Math.round(scenario.cash - baseline.cash),
    surplus: Math.round(scenario.monthlySurplus - baseline.monthlySurplus),
    resilience: Math.round((scenario.resilienceMonths - baseline.resilienceMonths) * 10) / 10,
    health: scenario.healthScore - baseline.healthScore,
    projected90dCash: Math.round(scenario.projected90dCash - baseline.projected90dCash),
  };
}

// ---- Main evaluation function ----

export function evaluatePersonalScenario(input: PersonalScenarioInput): PersonalScenarioResult {
  const { txs, levers, profile, now } = input;

  // Baseline: current financial state
  const baseline = computeSnapshot(txs, profile, now);

  // Scenario: modified financial state
  const scenarioTxs = buildScenarioTransactions(txs, levers, now);
  const scenario = computeSnapshot(scenarioTxs, profile, now);

  // Delta
  const delta = computeDelta(baseline, scenario);

  // Verdict
  const verdict = classifyVerdict(baseline, scenario, delta);

  // Alternatives (only if verdict is not green)
  const alternatives = verdict.level !== 'green'
    ? generateAlternatives(txs, levers, baseline, profile, now)
    : [];

  return { baseline, scenario, delta, verdict, alternatives, leversApplied: levers };
}
