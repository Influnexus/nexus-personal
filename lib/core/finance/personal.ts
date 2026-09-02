// ============================================================================================
// Shared core — Nexus Personal deterministic calculations (Sprint P2). Pure functions only:
// no DB, no session, no LLM. All money math for the Personal product lives HERE.
// Enterprise formulas in metrics/health/forecast are NOT touched by this module.
// ============================================================================================
import { TransactionLike, daysAgoFrom, sum } from './types';
import { detectRecurring } from './recurring';
import { computeExpenseBreakdown } from './metrics';
import type { ExpenseSlice } from './types';

// ---- Personal category taxonomy (P2.3) ----
export const PERSONAL_CATEGORIES = [
  'Income', 'Housing', 'Groceries', 'Utilities', 'Transportation', 'Dining', 'Subscriptions',
  'Health', 'Insurance', 'Debt', 'Entertainment', 'Shopping', 'Investments', 'Other',
] as const;
export type PersonalCategory = (typeof PERSONAL_CATEGORIES)[number];

export const ESSENTIAL_CATEGORIES: readonly string[] = ['Housing', 'Groceries', 'Utilities', 'Transportation', 'Insurance', 'Health'];
export const DISCRETIONARY_CATEGORIES: readonly string[] = ['Dining', 'Subscriptions', 'Entertainment', 'Shopping'];
// Debt payments are spending (they reduce surplus) but are surfaced as their OWN factor in
// health & resilience rather than blended into "essential lifestyle" spending.
// Investments are treated as savings (money kept), not spending — stated transparently in the UI.
export const SAVINGS_CATEGORIES: readonly string[] = ['Investments'];

export const HEALTH_DISCLAIMER = 'Nexus planning metric — not a credit score or a regulated financial rating.';

const r0 = (n: number) => Math.round(n) || 0; // also normalizes -0
const r1 = (n: number) => (Math.round(n * 10) / 10) || 0;
const r2 = (n: number) => (Math.round(n * 100) / 100) || 0;

function inWindow(t: TransactionLike, from: Date, to: Date): boolean {
  const d = new Date(t.date);
  return d >= from && d < to;
}

// ---- P2.4 Personal Financial State ----
export interface RecurringCommitment { vendor: string; category: string; monthlyAmount: number; cadenceDays: number }
export interface PersonalState {
  cash: number;
  income30d: number;
  spend30d: number;           // outflows excluding Investments (treated as savings)
  investing30d: number;       // Investments outflows
  surplus30d: number;         // income - spend
  savingsRate: number;        // (income - spend) / income, 0..1
  essential30d: number;
  discretionary30d: number;
  other30d: number;           // spend not in either bucket
  fixedMonthly: number;       // recurring outflow commitments normalized to monthly (excl. Investments)
  variableMonthly: number;    // spend30d - fixedMonthly (floored at 0)
  spendingTrendPct: number;   // last 30d vs prior 30d
  incomeTrendPct: number;
  topCategories: ExpenseSlice[]; // spending only (Investments excluded)
  recurringCommitments: RecurringCommitment[];
  transactionCount: number;
}

export function computePersonalState(txs: TransactionLike[], now: Date = new Date()): PersonalState {
  const spendTx = (from: Date, to: Date) =>
    -sum(txs.filter(t => t.amount < 0 && !SAVINGS_CATEGORIES.includes(t.category) && inWindow(t, from, to)).map(t => t.amount));
  const d0 = daysAgoFrom(now, 0), d30 = daysAgoFrom(now, 30), d60 = daysAgoFrom(now, 60);

  const cash = sum(txs.map(t => t.amount));
  const income30 = sum(txs.filter(t => t.amount > 0 && inWindow(t, d30, d0)).map(t => t.amount));
  const incomePrev = sum(txs.filter(t => t.amount > 0 && inWindow(t, d60, d30)).map(t => t.amount));
  const spend30 = spendTx(d30, d0);
  const spendPrev = spendTx(d60, d30);
  const investing30 = -sum(txs.filter(t => t.amount < 0 && SAVINGS_CATEGORIES.includes(t.category) && inWindow(t, d30, d0)).map(t => t.amount));

  const bucket = (cats: readonly string[]) =>
    -sum(txs.filter(t => t.amount < 0 && cats.includes(t.category) && inWindow(t, d30, d0)).map(t => t.amount));
  const essential30 = bucket(ESSENTIAL_CATEGORIES);
  const discretionary30 = bucket(DISCRETIONARY_CATEGORIES);

  const recurring = detectRecurring(txs).filter(r => r.sign < 0);
  const catOf = (vendor: string) => txs.find(t => t.vendor === vendor)?.category || 'Other';
  const commitments: RecurringCommitment[] = recurring
    .map(r => ({ vendor: r.vendor, category: catOf(r.vendor), monthlyAmount: r0(r.avgAmount * (30 / r.cadenceDays)), cadenceDays: r.cadenceDays }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  const fixedMonthly = sum(commitments.filter(c => !SAVINGS_CATEGORIES.includes(c.category)).map(c => c.monthlyAmount));

  const surplus = income30 - spend30;
  return {
    cash: r0(cash),
    income30d: r0(income30),
    spend30d: r0(spend30),
    investing30d: r0(investing30),
    surplus30d: r0(surplus),
    savingsRate: income30 > 0 ? r2(surplus / income30) : 0,
    essential30d: r0(essential30),
    discretionary30d: r0(discretionary30),
    other30d: r0(spend30 - essential30 - discretionary30),
    fixedMonthly: r0(fixedMonthly),
    variableMonthly: r0(Math.max(0, spend30 - fixedMonthly)),
    spendingTrendPct: spendPrev > 0 ? r1(((spend30 - spendPrev) / spendPrev) * 100) : 0,
    incomeTrendPct: incomePrev > 0 ? r1(((income30 - incomePrev) / incomePrev) * 100) : 0,
    topCategories: computeExpenseBreakdown(txs.filter(t => !SAVINGS_CATEGORIES.includes(t.category)), 30, now).slice(0, 6),
    recurringCommitments: commitments.slice(0, 10),
    transactionCount: txs.length,
  };
}

// ---- P2.5 Personal Financial Health (transparent factor model) ----
export type PersonalHealthBand = 'thriving' | 'healthy' | 'stable' | 'strained' | 'at_risk';
export type FactorStatus = 'strong' | 'moderate' | 'weak';
export interface PersonalHealthFactor { key: string; label: string; status: FactorStatus; points: number; maxPoints: number; note: string }
export interface PersonalHealth {
  score: number;               // 0..100
  band: PersonalHealthBand;
  factors: PersonalHealthFactor[];
  disclaimer: string;
}

export function computePersonalHealth(
  state: PersonalState,
  profile?: { monthlyDebtPayment?: number },
): PersonalHealth {
  const factors: PersonalHealthFactor[] = [];

  // 1. Savings rate (max 20)
  const sr = state.savingsRate;
  const srPts = sr >= 0.3 ? 20 : sr >= 0.15 ? 14 : sr >= 0.05 ? 8 : sr > 0 ? 4 : 0;
  factors.push({ key: 'savings_rate', label: 'Savings rate', points: srPts, maxPoints: 20,
    status: srPts >= 14 ? 'strong' : srPts >= 8 ? 'moderate' : 'weak',
    note: `You keep ${Math.round(sr * 100)}% of your income after spending.` });

  // 2. Emergency-fund coverage (max 25)
  const efMonths = state.essential30d > 0 ? Math.min(99, (Math.max(state.cash, 0) / state.essential30d)) : (state.cash > 0 ? 99 : 0);
  const efPts = efMonths >= 6 ? 25 : efMonths >= 3 ? 17 : efMonths >= 1 ? 8 : 2;
  factors.push({ key: 'emergency_fund', label: 'Emergency fund', points: efPts, maxPoints: 25,
    status: efPts >= 17 ? 'strong' : efPts >= 8 ? 'moderate' : 'weak',
    note: `${r1(efMonths)} month(s) of essential spending covered by your reserve.` });

  // 3. Debt pressure (max 20) — prefers the stated monthly debt payment, else observed Debt outflows
  const debtMonthly = profile?.monthlyDebtPayment ?? 0;
  const debtRatio = state.income30d > 0 ? (debtMonthly > 0 ? debtMonthly : 0) / state.income30d : (debtMonthly > 0 ? 1 : 0);
  const dbPts = debtRatio <= 0.1 ? 20 : debtRatio <= 0.25 ? 14 : debtRatio <= 0.4 ? 7 : 2;
  factors.push({ key: 'debt_pressure', label: 'Debt pressure', points: dbPts, maxPoints: 20,
    status: dbPts >= 14 ? 'strong' : dbPts >= 7 ? 'moderate' : 'weak',
    note: debtMonthly > 0 ? `Debt payments take ${Math.round(debtRatio * 100)}% of monthly income.` : 'No regular debt payments recorded.' });

  // 4. Income stability (max 20) — stable recurring inflow detected?
  const hasIncome = state.income30d > 0;
  const stable = state.recurringCommitments.length >= 0 && hasIncome; // presence baseline
  // A truly stable income shows as consistent month-over-month inflow.
  const incomeSteady = hasIncome && Math.abs(state.incomeTrendPct) <= 10;
  const isPts = incomeSteady ? 20 : hasIncome ? 10 : 4;
  factors.push({ key: 'income_stability', label: 'Income stability', points: isPts, maxPoints: 20,
    status: isPts >= 20 ? 'strong' : isPts >= 10 ? 'moderate' : 'weak',
    note: incomeSteady ? 'Income is consistent month to month.' : hasIncome ? `Income moved ${r1(state.incomeTrendPct)}% vs last month.` : 'No income recorded in the last 30 days.' });

  // 5. Spending trend (max 15)
  const tp = state.spendingTrendPct;
  const stPts = tp <= 0 ? 15 : tp <= 10 ? 10 : tp <= 25 ? 5 : 0;
  factors.push({ key: 'spending_trend', label: 'Spending trend', points: stPts, maxPoints: 15,
    status: stPts >= 10 ? 'strong' : stPts >= 5 ? 'moderate' : 'weak',
    note: tp === 0 ? 'Spending is steady.' : tp < 0 ? `Spending is down ${Math.abs(tp)}% vs last month.` : `Spending is up ${tp}% vs last month.` });

  const score = Math.max(0, Math.min(100, r0(sum(factors.map(f => f.points)))));
  const band: PersonalHealthBand = score >= 85 ? 'thriving' : score >= 70 ? 'healthy' : score >= 55 ? 'stable' : score >= 40 ? 'strained' : 'at_risk';
  return { score, band, factors, disclaimer: HEALTH_DISCLAIMER };
}

// ---- P2.6 Financial Resilience ----
export interface PersonalResilience {
  liquidReserve: number;
  essentialMonthly: number;    // trailing-90d average of essential-category spending
  resilienceMonths: number;    // reserve / essential monthly (1 decimal, capped 99)
  fixedMonthlyCommitments: number;
  debtMonthly: number;
  definition: string;
}

export function computePersonalResilience(
  txs: TransactionLike[],
  opts: { liquidReserve?: number; monthlyDebtPayment?: number; now?: Date } = {},
): PersonalResilience {
  const now = opts.now ?? new Date();
  const d90 = daysAgoFrom(now, 90);
  const essential90 = -sum(txs.filter(t => t.amount < 0 && ESSENTIAL_CATEGORIES.includes(t.category) && new Date(t.date) >= d90).map(t => t.amount));
  const essentialMonthly = essential90 / 3;
  const cash = sum(txs.map(t => t.amount));
  const reserve = opts.liquidReserve ?? Math.max(cash, 0);
  const recurring = detectRecurring(txs).filter(r => r.sign < 0 && ESSENTIAL_CATEGORIES.includes(txs.find(t => t.vendor === r.vendor)?.category || ''));
  const fixed = sum(recurring.map(r => r.avgAmount * (30 / r.cadenceDays)));
  const debt30 = opts.monthlyDebtPayment ?? -sum(txs.filter(t => t.amount < 0 && t.category === 'Debt' && new Date(t.date) >= daysAgoFrom(now, 30)).map(t => t.amount));
  return {
    liquidReserve: r0(reserve),
    essentialMonthly: r0(essentialMonthly),
    resilienceMonths: essentialMonthly > 0 ? Math.min(99, r1(reserve / essentialMonthly)) : (reserve > 0 ? 99 : 0),
    fixedMonthlyCommitments: r0(fixed),
    debtMonthly: r0(debt30),
    definition: 'How long you could maintain your essential lifestyle if your income stopped.',
  };
}

// ---- P2.7 "What changed?" — deterministic change feed (extended P3.9) ----
// P3 adds: savings_rate_change, resilience_change, forecast_direction
export interface PersonalChange {
  kind: 'spending_trend' | 'income_change' | 'category_change' | 'reserve_change' | 'savings_rate_change' | 'resilience_change' | 'forecast_direction';
  direction: 'up' | 'down';
  tone: 'positive' | 'negative' | 'neutral';
  pct?: number;
  amount?: number;
  category?: string;
  detail?: string; // P3: additional human-readable context
}

export function computeWhatChanged(txs: TransactionLike[], now: Date = new Date()): PersonalChange[] {
  const d0 = daysAgoFrom(now, 0), d30 = daysAgoFrom(now, 30), d60 = daysAgoFrom(now, 60);
  const out: PersonalChange[] = [];
  const state = computePersonalState(txs, now);

  if (Math.abs(state.spendingTrendPct) >= 3) {
    out.push({ kind: 'spending_trend', direction: state.spendingTrendPct > 0 ? 'up' : 'down',
      tone: state.spendingTrendPct > 0 ? 'negative' : 'positive', pct: Math.abs(state.spendingTrendPct) });
  }
  if (Math.abs(state.incomeTrendPct) >= 3) {
    out.push({ kind: 'income_change', direction: state.incomeTrendPct > 0 ? 'up' : 'down',
      tone: state.incomeTrendPct > 0 ? 'positive' : 'negative', pct: Math.abs(state.incomeTrendPct) });
  }

  // Biggest category movement (spending categories only)
  const catWindow = (from: Date, to: Date) => {
    const m = new Map<string, number>();
    for (const t of txs) if (t.amount < 0 && !SAVINGS_CATEGORIES.includes(t.category) && inWindow(t, from, to)) m.set(t.category, (m.get(t.category) || 0) + -t.amount);
    return m;
  };
  const cur = catWindow(d30, d0), prev = catWindow(d60, d30);
  let best: { category: string; delta: number } | null = null;
  for (const c of new Set([...cur.keys(), ...prev.keys()])) {
    const delta = (cur.get(c) || 0) - (prev.get(c) || 0);
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category: c, delta };
  }
  const floor = Math.max(500, state.income30d * 0.01);
  if (best && Math.abs(best.delta) >= floor) {
    out.push({ kind: 'category_change', category: best.category, amount: r0(Math.abs(best.delta)),
      direction: best.delta > 0 ? 'up' : 'down', tone: best.delta > 0 ? 'negative' : 'positive' });
  }

  // Reserve change = net cash movement over the last 30 days
  const net30 = sum(txs.filter(t => inWindow(t, d30, d0)).map(t => t.amount));
  if (Math.abs(net30) >= floor) {
    out.push({ kind: 'reserve_change', amount: r0(Math.abs(net30)), direction: net30 > 0 ? 'up' : 'down',
      tone: net30 > 0 ? 'positive' : 'negative' });
  }

  // P3.9 — Savings rate change: compare current vs prior period
  const prevIncome = sum(txs.filter(t => t.amount > 0 && inWindow(t, d60, d30)).map(t => t.amount));
  const prevSpend = -sum(txs.filter(t => t.amount < 0 && !SAVINGS_CATEGORIES.includes(t.category) && inWindow(t, d60, d30)).map(t => t.amount));
  const prevSavingsRate = prevIncome > 0 ? (prevIncome - prevSpend) / prevIncome : 0;
  const curSavingsRate = state.savingsRate;
  const srDelta = curSavingsRate - prevSavingsRate;
  if (Math.abs(srDelta) >= 0.03 && prevIncome > 0) { // at least 3pp change
    out.push({
      kind: 'savings_rate_change',
      direction: srDelta > 0 ? 'up' : 'down',
      tone: srDelta > 0 ? 'positive' : 'negative',
      pct: r1(Math.abs(srDelta) * 100),
      detail: `Savings rate moved from ${Math.round(prevSavingsRate * 100)}% to ${Math.round(curSavingsRate * 100)}%.`,
    });
  }

  return out.slice(0, 5);
}
