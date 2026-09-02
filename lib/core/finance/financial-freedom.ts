// ============================================================================================
// Shared core — Financial Freedom / Financial Independence (FI). PURE, deterministic.
// No DB, no session, no LLM. The LLM may EXPLAIN these outputs; it must never compute them.
//
// Default FI target uses the widely-cited "25x annual essential expenses" heuristic (the
// inverse of a 4% withdrawal rate). This is exposed as a TRANSPARENT, ADJUSTABLE assumption —
// NOT a guarantee. Real outcomes depend on inflation, investment returns, taxes, longevity and
// withdrawal rate, none of which are guaranteed.
// ============================================================================================

export const FI_DEFAULT_MULTIPLIER = 25;
export const FI_ASSUMPTION_NOTE =
  'FI target is estimated using 25x annual essential expenses (the inverse of a 4% withdrawal rate). ' +
  'This is a planning estimate, not a guarantee — actual outcomes depend on assumptions about spending, ' +
  'inflation, investment returns, taxes, longevity and withdrawal rate. Nexus makes no guaranteed-return claims.';

export type FIStatus = 'financially_free' | 'on_track' | 'building' | 'early' | 'not_progressing';

export interface FIFactor { key: string; label: string; detail: string }
export interface FIAction { key: string; title: string; detail: string; impact: 'high' | 'medium' | 'low' }

export interface FinancialFreedomInput {
  essentialMonthly: number;
  monthlySurplus: number;   // income - (essential + discretionary + debt); amount available to invest/save
  monthlyIncome: number;
  cash: number;
  investments: number;
  discretionaryMonthly?: number;
  monthlyDebtPayment?: number;
  multiplier?: number;      // default 25
  currency?: string;
}

export interface FinancialFreedomResult {
  currency: string;
  multiplier: number;
  // Inputs echoed for grounding/transparency
  currentAssets: number;          // cash + investments (liquid + invested financial assets)
  essentialMonthly: number;
  essentialAnnual: number;
  monthlySurplus: number;
  savingsRate: number;            // surplus / income, 0..1
  // FI math
  fiTarget: number;               // essentialAnnual * multiplier
  fiProgressPct: number;          // currentAssets / fiTarget * 100, capped 0..100 for display
  fiGap: number;                  // max(0, fiTarget - currentAssets)
  // Trajectory (deterministic, 0% real return baseline — transparent & conservative)
  monthsToFI: number | null;      // null when surplus <= 0 (not progressing) or already FI
  yearsToFI: number | null;
  status: FIStatus;
  helping: FIFactor[];
  slowing: FIFactor[];
  nextActions: FIAction[];
  assumptionNote: string;
  disclaimer: string;
}

const r0 = (n: number) => Math.round(n) || 0;
const r2 = (n: number) => (Math.round(n * 100) / 100) || 0;

export function computeFinancialFreedom(input: FinancialFreedomInput): FinancialFreedomResult {
  const currency = input.currency || 'INR';
  const multiplier = input.multiplier && input.multiplier > 0 ? input.multiplier : FI_DEFAULT_MULTIPLIER;

  const essentialMonthly = Math.max(0, input.essentialMonthly || 0);
  const essentialAnnual = essentialMonthly * 12;
  const monthlySurplus = input.monthlySurplus || 0;
  const monthlyIncome = Math.max(0, input.monthlyIncome || 0);
  const currentAssets = Math.max(0, (input.cash || 0) + (input.investments || 0));
  const discretionary = Math.max(0, input.discretionaryMonthly || 0);
  const debt = Math.max(0, input.monthlyDebtPayment || 0);

  const fiTarget = r0(essentialAnnual * multiplier);
  const fiGap = r0(Math.max(0, fiTarget - currentAssets));
  const fiProgressPct = fiTarget > 0 ? r2(Math.min(100, Math.max(0, (currentAssets / fiTarget) * 100))) : 0;
  const savingsRate = monthlyIncome > 0 ? r2(monthlySurplus / monthlyIncome) : 0;

  // Deterministic trajectory: contributions only, 0% real return (transparent, conservative).
  let monthsToFI: number | null = null;
  if (fiGap <= 0) monthsToFI = 0;
  else if (monthlySurplus > 0) monthsToFI = Math.ceil(fiGap / monthlySurplus);
  const yearsToFI = monthsToFI == null ? null : r2(monthsToFI / 12);

  // Status band
  let status: FIStatus;
  if (fiGap <= 0) status = 'financially_free';
  else if (monthlySurplus <= 0) status = 'not_progressing';
  else if (fiProgressPct >= 50) status = 'on_track';
  else if (fiProgressPct >= 15) status = 'building';
  else status = 'early';

  // Helping factors (deterministic)
  const helping: FIFactor[] = [];
  if (savingsRate >= 0.2) helping.push({ key: 'savings_rate', label: 'Strong savings rate', detail: `You keep ${Math.round(savingsRate * 100)}% of your income each month.` });
  if (input.investments > 0) helping.push({ key: 'invested_assets', label: 'Invested assets working for you', detail: `You already hold ${currency} ${r0(input.investments).toLocaleString('en-IN')} in investments.` });
  if (monthlySurplus > 0) helping.push({ key: 'positive_surplus', label: 'Positive monthly surplus', detail: `You add about ${currency} ${r0(monthlySurplus).toLocaleString('en-IN')} toward FI every month.` });
  if (debt === 0) helping.push({ key: 'no_debt', label: 'No monthly debt payments', detail: 'You have no recurring debt reducing your surplus.' });

  // Slowing factors (deterministic)
  const slowing: FIFactor[] = [];
  if (monthlySurplus <= 0) slowing.push({ key: 'no_surplus', label: 'No monthly surplus', detail: 'Your spending currently matches or exceeds income, so assets are not growing toward FI.' });
  if (savingsRate > 0 && savingsRate < 0.1) slowing.push({ key: 'low_savings_rate', label: 'Low savings rate', detail: `Only ${Math.round(savingsRate * 100)}% of income is being saved.` });
  if (discretionary > 0 && essentialMonthly > 0 && discretionary >= essentialMonthly * 0.5) slowing.push({ key: 'high_discretionary', label: 'High lifestyle spending', detail: `Lifestyle spending (${currency} ${r0(discretionary).toLocaleString('en-IN')}/mo) is large relative to essentials.` });
  if (debt > 0) slowing.push({ key: 'debt_payments', label: 'Debt payments reduce surplus', detail: `${currency} ${r0(debt).toLocaleString('en-IN')}/mo goes to debt instead of investing.` });

  // Highest-impact next actions (deterministic, ordered)
  const nextActions: FIAction[] = [];
  const emergencyMonths = essentialMonthly > 0 ? currentAssets === 0 ? 0 : (input.cash || 0) / essentialMonthly : 99;
  if (monthlySurplus <= 0) {
    nextActions.push({ key: 'create_surplus', title: 'Create a monthly surplus', detail: 'Reduce lifestyle or essential costs, or raise income, so you have money left to invest each month.', impact: 'high' });
  }
  if (emergencyMonths < 6 && essentialMonthly > 0) {
    nextActions.push({ key: 'emergency_fund', title: 'Build a 6-month emergency fund first', detail: `Aim for ${currency} ${r0(essentialMonthly * 6).toLocaleString('en-IN')} in liquid cash before investing aggressively for FI.`, impact: 'high' });
  }
  if (discretionary > 0 && monthlySurplus > 0 && discretionary >= essentialMonthly * 0.4) {
    nextActions.push({ key: 'trim_lifestyle', title: 'Redirect some lifestyle spending to investing', detail: `Even shifting 20% of lifestyle spending (~${currency} ${r0(discretionary * 0.2).toLocaleString('en-IN')}/mo) would speed up FI.`, impact: 'medium' });
  }
  if (monthlySurplus > 0) {
    nextActions.push({ key: 'automate_investing', title: 'Automate monthly investing', detail: `Consistently investing your ${currency} ${r0(monthlySurplus).toLocaleString('en-IN')} surplus is the single biggest driver of FI progress.`, impact: 'high' });
  }
  if (debt > 0) {
    nextActions.push({ key: 'reduce_debt', title: 'Reduce high-cost debt', detail: 'Clearing debt frees up monthly cash flow that can then compound toward FI.', impact: 'medium' });
  }

  return {
    currency,
    multiplier,
    currentAssets: r0(currentAssets),
    essentialMonthly: r0(essentialMonthly),
    essentialAnnual: r0(essentialAnnual),
    monthlySurplus: r0(monthlySurplus),
    savingsRate,
    fiTarget,
    fiProgressPct,
    fiGap,
    monthsToFI,
    yearsToFI,
    status,
    helping,
    slowing,
    nextActions: nextActions.slice(0, 5),
    assumptionNote: FI_ASSUMPTION_NOTE,
    disclaimer: 'Planning estimate only — not financial advice and not a guaranteed outcome.',
  };
}
