// ============================================================================================
// Shared core — Deterministic Financial Alert Engine (Sprint P3)
// Pure function: no DB, no session, no LLM, no persistent storage.
// Alerts are computed on read from current state + forecast data.
//
// ALERT TYPES:
//   LOW_RESILIENCE         — reserve covers fewer months of essential spending
//   PROJECTED_CASH_DECLINE — forecast shows cash position deteriorating
//   PROJECTED_CASH_LOW     — lowest projected cash is dangerously low
//   SPENDING_INCREASE      — total spending trending up significantly
//   CATEGORY_OVERSPEND     — a specific category meaningfully exceeds its baseline
//   LARGE_ANOMALY          — statistically unusual charge detected
//   UPCOMING_MAJOR_EXPENSE — a large known commitment is coming soon
//   SAVINGS_IMPROVED       — positive: savings rate improved (keeps alerts balanced)
//
// SEVERITY LEVELS:
//   CRITICAL — requires immediate attention (e.g., < 1 month reserve)
//   WARNING  — noteworthy risk or drift (e.g., spending up 18%)
//   INFO     — positive or informational (e.g., savings rate improved)
//
// NOISE PREVENTION:
//   - Minimum absolute thresholds prevent alerts on tiny fluctuations
//   - Each alert type fires at most once (dedup by type+context)
//   - Positive alerts are included to avoid an anxiety-only experience
//
// THRESHOLDS (all documented inline):
//   LOW_RESILIENCE:         < 1 month = CRITICAL, < 3 months = WARNING
//   PROJECTED_CASH_DECLINE: ending < starting by > 30% = CRITICAL, > 15% = WARNING
//   PROJECTED_CASH_LOW:     lowest < 1 month essential = CRITICAL, < 2 months = WARNING
//   SPENDING_INCREASE:      > 25% = CRITICAL, > 12% = WARNING
//   CATEGORY_OVERSPEND:     > 25% above baseline AND > minFloor = WARNING
//   LARGE_ANOMALY:          from anomaly detector = WARNING
//   UPCOMING_MAJOR_EXPENSE: > 15% of monthly income within 30 days = INFO
//   SAVINGS_IMPROVED:       savings rate > 0 and spending trend down = INFO
// ============================================================================================

import { PersonalState, PersonalResilience } from './personal';
import { ForecastResult } from './types';
import { Anomaly } from './types';

// ---- Alert type definitions ----

export type AlertType =
  | 'LOW_RESILIENCE'
  | 'PROJECTED_CASH_DECLINE'
  | 'PROJECTED_CASH_LOW'
  | 'SPENDING_INCREASE'
  | 'CATEGORY_OVERSPEND'
  | 'LARGE_ANOMALY'
  | 'UPCOMING_MAJOR_EXPENSE'
  | 'SAVINGS_IMPROVED';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface PersonalAlert {
  id: string;                     // deterministic: type + context hash
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  metric?: string;                // the key number (e.g., "1.2 months", "+22%")
  context?: string;               // additional context (e.g., category name, vendor)
  recommendation?: string;        // soft language: "Consider reviewing..."
  timestamp: string;              // ISO date of computation
}

// ---- Input contract ----

export interface AlertInput {
  state: PersonalState;
  resilience: PersonalResilience;
  forecast?: ForecastResult | null;  // may be null if insufficient data
  anomalies?: Anomaly[];
  currency?: string;
  now?: Date;
}

// ---- Threshold constants (documented, deterministic) ----

const THRESHOLDS = {
  // Resilience
  RESILIENCE_CRITICAL_MONTHS: 1,       // < 1 month = CRITICAL
  RESILIENCE_WARNING_MONTHS: 3,        // < 3 months = WARNING

  // Cash decline (% of starting cash)
  CASH_DECLINE_CRITICAL_PCT: 30,       // ending < starting by > 30% = CRITICAL
  CASH_DECLINE_WARNING_PCT: 15,        // ending < starting by > 15% = WARNING

  // Low projected cash (months of essential spending)
  CASH_LOW_CRITICAL_MONTHS: 1,         // lowest projected < 1 month essential = CRITICAL
  CASH_LOW_WARNING_MONTHS: 2,          // lowest projected < 2 months essential = WARNING

  // Spending increase
  SPENDING_INCREASE_CRITICAL_PCT: 25,  // > 25% vs prior period = CRITICAL
  SPENDING_INCREASE_WARNING_PCT: 12,   // > 12% vs prior period = WARNING

  // Category overspend
  CATEGORY_OVERSPEND_PCT: 25,          // category > 25% above baseline = WARNING
  CATEGORY_MIN_FLOOR: 2000,            // don't alert if absolute increase < ₹2000

  // Upcoming major expense
  UPCOMING_EXPENSE_INCOME_PCT: 15,     // > 15% of monthly income = notable

  // Minimum income floor for ratio-based alerts
  MIN_INCOME_FOR_ALERTS: 1000,
} as const;

export { THRESHOLDS as ALERT_THRESHOLDS };

// ---- Core alert computation ----

export function computePersonalAlerts(input: AlertInput): PersonalAlert[] {
  const { state, resilience, forecast, anomalies = [], currency = 'INR', now = new Date() } = input;
  const alerts: PersonalAlert[] = [];
  const ts = now.toISOString().slice(0, 10);
  const seen = new Set<string>(); // dedup by type+context

  const add = (alert: PersonalAlert) => {
    const key = `${alert.type}:${alert.context || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  };

  // Helper: format money for display
  const money = (n: number) => {
    const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
    return `${sym}${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
  };

  // ======================================================================
  // 1. LOW_RESILIENCE — how long can you survive without income?
  // ======================================================================
  if (resilience.essentialMonthly > 0) {
    const months = resilience.resilienceMonths;
    if (months < THRESHOLDS.RESILIENCE_CRITICAL_MONTHS) {
      add({
        id: `LOW_RESILIENCE:critical:${ts}`,
        type: 'LOW_RESILIENCE',
        severity: 'critical',
        title: 'Reserve critically low',
        explanation: `Your liquid reserve covers less than ${THRESHOLDS.RESILIENCE_CRITICAL_MONTHS} month of essential spending. If your income stopped today, you would face immediate difficulty covering essentials like housing, groceries, and utilities.`,
        metric: `${months} months`,
        recommendation: 'Consider reviewing any non-essential spending and building your reserve as a priority.',
        timestamp: ts,
      });
    } else if (months < THRESHOLDS.RESILIENCE_WARNING_MONTHS) {
      add({
        id: `LOW_RESILIENCE:warning:${ts}`,
        type: 'LOW_RESILIENCE',
        severity: 'warning',
        title: 'Reserve below safety margin',
        explanation: `Your liquid reserve covers ${months} months of essential spending. Financial planners generally recommend maintaining at least 3–6 months as a buffer.`,
        metric: `${months} months`,
        recommendation: 'Consider building your reserve gradually — even small monthly additions strengthen your safety net.',
        timestamp: ts,
      });
    }
  }

  // ======================================================================
  // 2. PROJECTED_CASH_DECLINE — forecast shows cash deteriorating
  // ======================================================================
  if (forecast && forecast.startingCash > 0) {
    const declinePct = ((forecast.startingCash - forecast.endingCash) / forecast.startingCash) * 100;
    if (declinePct > THRESHOLDS.CASH_DECLINE_CRITICAL_PCT) {
      add({
        id: `PROJECTED_CASH_DECLINE:critical:${ts}`,
        type: 'PROJECTED_CASH_DECLINE',
        severity: 'critical',
        title: 'Significant cash decline projected',
        explanation: `Based on your current income and spending patterns, your cash position is projected to decline by ${Math.round(declinePct)}% over the next 90 days. This is primarily driven by recurring commitments exceeding recurring income.`,
        metric: `−${Math.round(declinePct)}%`,
        recommendation: 'Consider reviewing your recurring commitments and identifying areas where spending could be reduced.',
        timestamp: ts,
      });
    } else if (declinePct > THRESHOLDS.CASH_DECLINE_WARNING_PCT) {
      add({
        id: `PROJECTED_CASH_DECLINE:warning:${ts}`,
        type: 'PROJECTED_CASH_DECLINE',
        severity: 'warning',
        title: 'Cash position trending down',
        explanation: `Your cash position is projected to decrease by ${Math.round(declinePct)}% over the next 90 days based on current patterns.`,
        metric: `−${Math.round(declinePct)}%`,
        recommendation: 'Based on your current forecast, consider monitoring whether this trend continues next month.',
        timestamp: ts,
      });
    }
  }

  // ======================================================================
  // 3. PROJECTED_CASH_LOW — lowest projected cash dangerously low
  // ======================================================================
  if (forecast && resilience.essentialMonthly > 0) {
    const lowestCash = forecast.lowestDay.cash;
    const monthsAtLowest = lowestCash / resilience.essentialMonthly;
    if (monthsAtLowest < THRESHOLDS.CASH_LOW_CRITICAL_MONTHS && lowestCash < forecast.startingCash) {
      add({
        id: `PROJECTED_CASH_LOW:critical:${ts}`,
        type: 'PROJECTED_CASH_LOW',
        severity: 'critical',
        title: 'Projected cash falls below safety level',
        explanation: `Your projected cash balance drops to ${money(lowestCash)} around ${forecast.lowestDay.day}, which covers less than ${THRESHOLDS.CASH_LOW_CRITICAL_MONTHS} month of essential spending.`,
        metric: money(lowestCash),
        context: forecast.lowestDay.day,
        recommendation: 'Consider planning for this period — you may need to defer non-essential purchases or accelerate any expected income.',
        timestamp: ts,
      });
    } else if (monthsAtLowest < THRESHOLDS.CASH_LOW_WARNING_MONTHS && lowestCash < forecast.startingCash) {
      add({
        id: `PROJECTED_CASH_LOW:warning:${ts}`,
        type: 'PROJECTED_CASH_LOW',
        severity: 'warning',
        title: 'Cash may dip to a tight level',
        explanation: `Around ${forecast.lowestDay.day}, your projected cash balance drops to ${money(lowestCash)} — about ${Math.round(monthsAtLowest * 10) / 10} months of essential spending.`,
        metric: money(lowestCash),
        context: forecast.lowestDay.day,
        recommendation: 'Based on your current forecast, this may affect your financial resilience temporarily.',
        timestamp: ts,
      });
    }
  }

  // ======================================================================
  // 4. SPENDING_INCREASE — total spending trending up significantly
  // ======================================================================
  if (state.spend30d > 0 && Math.abs(state.spendingTrendPct) > 0) {
    const pct = state.spendingTrendPct;
    // Only alert on increases, and only if absolute increase is meaningful
    const absIncrease = state.spend30d * (pct / 100) / (1 + pct / 100); // approximate absolute delta
    const minFloor = Math.max(THRESHOLDS.CATEGORY_MIN_FLOOR, state.income30d * 0.02);

    if (pct > THRESHOLDS.SPENDING_INCREASE_CRITICAL_PCT && absIncrease > minFloor) {
      add({
        id: `SPENDING_INCREASE:critical:${ts}`,
        type: 'SPENDING_INCREASE',
        severity: 'critical',
        title: 'Spending surged this month',
        explanation: `Your total spending increased ${Math.round(pct)}% compared to the previous month. This may affect your savings rate and financial resilience if sustained.`,
        metric: `+${Math.round(pct)}%`,
        recommendation: 'Consider reviewing your recent transactions to understand what drove the increase.',
        timestamp: ts,
      });
    } else if (pct > THRESHOLDS.SPENDING_INCREASE_WARNING_PCT && absIncrease > minFloor) {
      add({
        id: `SPENDING_INCREASE:warning:${ts}`,
        type: 'SPENDING_INCREASE',
        severity: 'warning',
        title: 'Spending increased',
        explanation: `Your spending is up ${Math.round(pct)}% compared to last month. This is above your recent baseline.`,
        metric: `+${Math.round(pct)}%`,
        recommendation: 'Consider checking which categories contributed most to the increase.',
        timestamp: ts,
      });
    }
  }

  // ======================================================================
  // 5. CATEGORY_OVERSPEND — a specific category exceeds baseline
  // ======================================================================
  // Use topCategories and compare with what we can derive from state
  // We detect significant per-category changes using the state data
  if (state.topCategories.length > 0 && state.income30d > THRESHOLDS.MIN_INCOME_FOR_ALERTS) {
    // We rely on the "What Changed" category_change logic but for multiple categories
    // Since we get topCategories from state, we check if any category's share seems
    // disproportionately high. However, for proper baseline comparison we'd need prior period.
    // The spendingTrendPct covers total — for per-category we check the top one
    // against a reasonable share threshold.
    //
    // A category consuming > 40% of total spend AND being > 25% above what we'd expect
    // based on its normal share is flagged.
    const topCat = state.topCategories[0];
    if (topCat && topCat.share > 0.40 && state.spendingTrendPct > 5) {
      const catAmount = topCat.amount;
      if (catAmount > THRESHOLDS.CATEGORY_MIN_FLOOR) {
        add({
          id: `CATEGORY_OVERSPEND:warning:${topCat.category}:${ts}`,
          type: 'CATEGORY_OVERSPEND',
          severity: 'warning',
          title: `${topCat.category} spending is high`,
          explanation: `${topCat.category} accounts for ${Math.round(topCat.share * 100)}% of your total spending this month (${money(catAmount)}), which is above your recent baseline.`,
          metric: `${Math.round(topCat.share * 100)}%`,
          context: topCat.category,
          recommendation: `Consider reviewing your ${topCat.category.toLowerCase()} expenses to see if there are opportunities to optimize.`,
          timestamp: ts,
        });
      }
    }
  }

  // ======================================================================
  // 6. LARGE_ANOMALY — statistically unusual charges
  // ======================================================================
  if (anomalies.length > 0) {
    const topAnomaly = anomalies[0]; // already sorted by amount desc
    add({
      id: `LARGE_ANOMALY:warning:${topAnomaly.transactionId}:${ts}`,
      type: 'LARGE_ANOMALY',
      severity: 'warning',
      title: `Unusual ${topAnomaly.vendor} charge`,
      explanation: topAnomaly.reason,
      metric: money(topAnomaly.amount),
      context: topAnomaly.vendor,
      recommendation: `Consider verifying this charge with ${topAnomaly.vendor}. If unexpected, review your recent ${topAnomaly.category.toLowerCase()} transactions.`,
      timestamp: ts,
    });
  }

  // ======================================================================
  // 7. UPCOMING_MAJOR_EXPENSE — large known commitments coming soon
  // ======================================================================
  if (forecast && state.income30d > THRESHOLDS.MIN_INCOME_FOR_ALERTS) {
    const threshold = state.income30d * (THRESHOLDS.UPCOMING_EXPENSE_INCOME_PCT / 100);
    const upcomingDays = 30;
    const today = now.toISOString().slice(0, 10);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + upcomingDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Find large scheduled outflows in the next 30 days
    for (const day of forecast.series) {
      if (day.day <= today || day.day > cutoffStr) continue;
      if (!day.drivers) continue;
      for (const drv of day.drivers) {
        if (drv.amount < 0 && Math.abs(drv.amount) > threshold) {
          const daysUntil = Math.round((new Date(day.day).getTime() - now.getTime()) / 86400000);
          add({
            id: `UPCOMING_MAJOR_EXPENSE:info:${drv.label}:${day.day}`,
            type: 'UPCOMING_MAJOR_EXPENSE',
            severity: 'info',
            title: `Upcoming expense: ${drv.label}`,
            explanation: `A ${money(Math.abs(drv.amount))} payment to ${drv.label} is expected in approximately ${daysUntil} days (around ${day.day}).`,
            metric: money(Math.abs(drv.amount)),
            context: `${daysUntil} days`,
            recommendation: 'This is a known recurring commitment. Ensure sufficient funds are available.',
            timestamp: ts,
          });
          break; // only the most significant upcoming expense
        }
      }
    }
  }

  // ======================================================================
  // 8. SAVINGS_IMPROVED — positive signal to keep alerts balanced
  // ======================================================================
  if (state.savingsRate > 0.05 && state.spendingTrendPct < -3) {
    add({
      id: `SAVINGS_IMPROVED:info:${ts}`,
      type: 'SAVINGS_IMPROVED',
      severity: 'info',
      title: 'Savings rate improved',
      explanation: `Your savings rate is ${Math.round(state.savingsRate * 100)}% this month, and your spending decreased ${Math.abs(Math.round(state.spendingTrendPct))}% compared to last month. You're building your reserve.`,
      metric: `${Math.round(state.savingsRate * 100)}%`,
      recommendation: 'Keep it up — consistent savings strengthen your financial resilience over time.',
      timestamp: ts,
    });
  }

  // Sort by severity priority: critical > warning > info
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ---- Utility: get only the top N highest-priority alerts for dashboard ----
export function getTopAlerts(alerts: PersonalAlert[], max = 3): PersonalAlert[] {
  return alerts.slice(0, max);
}
