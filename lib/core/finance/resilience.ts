// Shared core — financial resilience (Sprint P1, NEW deterministic module). Built entirely from
// existing primitives (recurring detection + trailing aggregates); no new formulas were imposed
// on Enterprise — this module is not yet consumed by any Enterprise route.
import { TransactionLike, ResilienceReport, daysAgoFrom, sum } from './types';
import { detectRecurring } from './recurring';

export function computeResilience(txs: TransactionLike[], now: Date = new Date()): ResilienceReport {
  const cash = sum(txs.map(t => t.amount));
  const last90 = txs.filter(t => new Date(t.date) >= daysAgoFrom(now, 90));
  const expense90 = -sum(last90.filter(t => t.amount < 0).map(t => t.amount));
  const income90 = sum(last90.filter(t => t.amount > 0).map(t => t.amount));
  const avgMonthlyExpense = expense90 / 3;
  const avgMonthlyIncome = income90 / 3;

  // Fixed commitments: recurring OUTFLOW patterns normalized to a monthly figure.
  const recurring = detectRecurring(txs);
  const fixedMonthlyCommitments = sum(
    recurring.filter(r => r.sign < 0).map(r => r.avgAmount * (30 / r.cadenceDays)),
  );

  // Income concentration: share of trailing-90d income from the single largest source.
  const bySource = new Map<string, number>();
  for (const t of last90.filter(x => x.amount > 0)) bySource.set(t.vendor, (bySource.get(t.vendor) || 0) + t.amount);
  const largest = Math.max(0, ...bySource.values());
  const incomeConcentration = income90 > 0 ? largest / income90 : 0;

  const dailySpend = avgMonthlyExpense / 30;
  return {
    cash: Math.round(cash),
    avgMonthlyExpense: Math.round(avgMonthlyExpense),
    avgMonthlyIncome: Math.round(avgMonthlyIncome),
    emergencyFundMonths: avgMonthlyExpense > 0 ? Math.round((Math.max(cash, 0) / avgMonthlyExpense) * 10) / 10 : 0,
    fixedMonthlyCommitments: Math.round(fixedMonthlyCommitments),
    fixedCostRatio: avgMonthlyExpense > 0 ? Math.round((fixedMonthlyCommitments / avgMonthlyExpense) * 100) / 100 : 0,
    incomeStreams: recurring.filter(r => r.sign > 0).length,
    incomeConcentration: Math.round(incomeConcentration * 100) / 100,
    shockHorizonDays: dailySpend > 0 ? Math.max(0, Math.floor(Math.max(cash, 0) / dailySpend)) : 0,
  };
}
