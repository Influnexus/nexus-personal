// Shared core — recurring cash-pattern detection. Extracted VERBATIM from
// lib/services/forecast.service.ts (Sprint P1). Behavior must not change.
import { TransactionLike, RecurringPattern } from './types';

// Detect vendors whose transactions recur on a stable cadence.
export function detectRecurring(txs: TransactionLike[]): RecurringPattern[] {
  const byVendor = new Map<string, TransactionLike[]>();
  for (const t of txs) {
    const a = byVendor.get(t.vendor) || []; a.push(t); byVendor.set(t.vendor, a);
  }
  const out: RecurringPattern[] = [];
  for (const [vendor, arr] of byVendor) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
      if (g > 0) gaps.push(g);
    }
    if (gaps.length < 2) continue;
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
    const cv = avgGap > 0 ? Math.sqrt(variance) / avgGap : 1;
    // Stable cadence: low CV and at least 3 observations within ~6 months
    if (cv < 0.45 && avgGap >= 5 && avgGap <= 35) {
      const avgAmount = arr.reduce((s, t) => s + Math.abs(t.amount), 0) / arr.length;
      const sign: 1 | -1 = arr[0].amount >= 0 ? 1 : -1;
      out.push({ vendor, avgAmount, cadenceDays: Math.round(avgGap), sign });
    }
  }
  return out;
}
