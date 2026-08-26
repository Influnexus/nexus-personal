// Shared core — statistical anomaly detection (z-score per vendor). Extracted VERBATIM from
// lib/services/finance.service.ts (Sprint P1); clock injectable, defaults identical.
import { TransactionLike, Anomaly, daysAgoFrom } from './types';

export function computeAnomalies(txs: TransactionLike[], now: Date = new Date()): Anomaly[] {
  const byVendor = new Map<string, TransactionLike[]>();
  for (const t of txs.filter(x => x.amount < 0)) { const arr = byVendor.get(t.vendor) || []; arr.push(t); byVendor.set(t.vendor, arr); }
  const out: Anomaly[] = [];
  for (const [vendor, vtxs] of byVendor) {
    if (vtxs.length < 4) continue;
    const amts = vtxs.map(t => -t.amount);
    const mean = amts.reduce((a, b) => a + b, 0) / amts.length;
    const sd = Math.sqrt(amts.reduce((s, v) => s + (v - mean) ** 2, 0) / amts.length);
    const cutoff = daysAgoFrom(now, 45);
    for (const t of vtxs) {
      if (new Date(t.date) < cutoff) continue;
      const z = sd > 0 ? (-t.amount - mean) / sd : 0;
      if (z > 2.2 && -t.amount > mean + 100) {
        out.push({ transactionId: t.id, date: t.date, vendor, amount: -t.amount, category: t.category,
          reason: `Unusually large ${vendor} charge — ${(z).toFixed(1)}σ above norm ($${Math.round(mean).toLocaleString()})` });
      }
    }
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 5);
}
