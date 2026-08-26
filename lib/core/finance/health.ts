// Shared core — health scoring. The BUSINESS factor set is extracted VERBATIM from
// lib/services/finance.service.ts healthScore() (Sprint P1). Behavior must not change.
// (A personal factor set will be added in Sprint P2 as a sibling function — same output shape.)
import { Kpis, HealthScoreBreakdown } from './types';

export function computeBusinessHealthScore(k: Kpis): HealthScoreBreakdown {
  const factors: { label: string; impact: number; note: string }[] = [];
  let score = 50;
  const margin = k.revenue30d > 0 ? (k.profit30d / k.revenue30d) : -1;
  const marginPts = Math.max(-20, Math.min(25, margin * 50));
  score += marginPts;
  factors.push({ label: 'Profit margin', impact: Math.round(marginPts), note: `${(margin * 100).toFixed(1)}% net margin (30d)` });
  const runwayPts = k.runwayDays == null ? 15 : k.runwayDays >= 365 ? 20 : k.runwayDays >= 180 ? 12 : k.runwayDays >= 90 ? 4 : -15;
  score += runwayPts;
  factors.push({ label: 'Cash runway', impact: runwayPts, note: k.runwayDays == null ? 'Cash-flow positive' : `${k.runwayDays} days` });
  const growthPts = Math.max(-10, Math.min(15, k.revDeltaPct / 2));
  score += growthPts;
  factors.push({ label: 'Revenue growth', impact: Math.round(growthPts), note: `${k.revDeltaPct >= 0 ? '+' : ''}${k.revDeltaPct.toFixed(1)}% vs prior 30d` });
  const arPts = k.outstandingAmount > 50000 ? -8 : k.outstandingAmount > 20000 ? -3 : 5;
  score += arPts;
  factors.push({ label: 'Accounts receivable', impact: arPts, note: `${k.outstandingInvoices} open invoice(s), $${k.outstandingAmount.toLocaleString()}` });
  const ctlPts = k.expDeltaPct > 25 ? -8 : k.expDeltaPct > 10 ? -3 : 5;
  score += ctlPts;
  factors.push({ label: 'Expense control', impact: ctlPts, note: `${k.expDeltaPct >= 0 ? '+' : ''}${k.expDeltaPct.toFixed(1)}% vs prior 30d` });
  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: HealthScoreBreakdown['band'] = score >= 85 ? 'excellent' : score >= 70 ? 'strong' : score >= 55 ? 'fair' : score >= 40 ? 'weak' : 'at_risk';
  return { score, band, factors };
}
