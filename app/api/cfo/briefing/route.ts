import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { financeService } from '@/lib/services/finance.service';
import { seedService } from '@/lib/services/seed.service';
import { runCfoAgent } from '@/lib/ai/agent';
import { BRIEFING_PROMPT } from '@/lib/ai/prompts';
import { LLMUnavailableError } from '@/lib/ai/provider';
import { briefingCache } from '@/lib/ai/briefing-cache';

export const runtime = 'nodejs';

// Fallback deterministic briefing built entirely from computed KPIs — used when the LLM is unavailable.
function fallbackBriefing(kpis: any, health: any, overdue: any[], anomalies: any[]) {
  const hour = new Date().getHours();
  const salute = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const overdueLine = overdue.length > 0
    ? `• ${overdue.length} overdue invoice(s) — largest: ${overdue[0].vendor} $${(overdue[0].amount || 0).toLocaleString()} due ${overdue[0].dueDate}.`
    : `• No overdue invoices.`;
  const anomalyLine = anomalies.length > 0
    ? `• ${anomalies.length} anomaly: ${anomalies[0].vendor} $${Math.round(anomalies[0].amount).toLocaleString()}.`
    : `• No anomalies detected in the last 45 days.`;
  return `${salute}\n\n**Business Health: ${health.score}/100** — ${health.band.replace('_', ' ')}.\n\n• Revenue (30d): $${Math.round(kpis.revenue30d).toLocaleString()} (${kpis.revDeltaPct >= 0 ? '+' : ''}${kpis.revDeltaPct.toFixed(1)}% vs prior).\n• Cash runway: ${kpis.runwayDays == null ? '∞' : kpis.runwayDays + ' days'}.\n${overdueLine}\n${anomalyLine}\n\n_AI narration is temporarily unavailable; figures above are computed directly from your data._`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  await seedService.seedOrg(orgId);

  const [kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors] = await Promise.all([
    financeService.kpis(orgId), financeService.healthScore(orgId),
    financeService.overdueInvoices(orgId), financeService.anomalies(orgId),
    financeService.recommendations(orgId), financeService.cashflowForecast(orgId, 90),
    financeService.expenseBreakdown(orgId, 30), financeService.topVendors(orgId, 90),
  ]);

  let briefing = '';
  let aiAvailable = true;
  const cached = briefingCache.get(orgId);
  if (cached) {
    briefing = cached.text;
    aiAvailable = cached.aiAvailable;
  } else {
    try {
      const trace = await runCfoAgent([{ role: 'user', content: BRIEFING_PROMPT }], { organizationId: orgId }, { maxSteps: 6, temperature: 0.4 });
      briefing = trace.finalAnswer || fallbackBriefing(kpis, health, overdue, anomalies);
      briefingCache.set(orgId, briefing, true);
    } catch (e) {
      aiAvailable = false;
      briefing = fallbackBriefing(kpis, health, overdue, anomalies);
      console.warn('[briefing] AI unavailable, served fallback briefing');
      // Don't cache the fallback — retry the real LLM call next time rather than being stuck for 10min.
    }
  }

  return NextResponse.json({ briefing, aiAvailable, kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors });
}
