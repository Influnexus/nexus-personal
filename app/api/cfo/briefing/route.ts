import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { financeService } from '@/lib/services/finance.service';
import { seedService } from '@/lib/services/seed.service';
import { runCfoAgent } from '@/lib/ai/agent';
import { BRIEFING_PROMPT } from '@/lib/ai/prompts';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  // Auto-seed demo data on first visit so the CFO has something to talk about
  await seedService.seedOrg(orgId);

  const [kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors] = await Promise.all([
    financeService.kpis(orgId),
    financeService.healthScore(orgId),
    financeService.overdueInvoices(orgId),
    financeService.anomalies(orgId),
    financeService.recommendations(orgId),
    financeService.cashflowForecast(orgId, 90),
    financeService.expenseBreakdown(orgId, 30),
    financeService.topVendors(orgId, 90),
  ]);

  // Generate the briefing text via the LLM agent (uses tools internally for grounding).
  let briefing = '';
  try {
    const trace = await runCfoAgent([{ role: 'user', content: BRIEFING_PROMPT }], { organizationId: orgId }, { maxSteps: 6, temperature: 0.4 });
    briefing = trace.finalAnswer;
  } catch (e: any) {
    briefing = `Good day.\n\n**Business Health: ${health.score}/100** — ${health.band}.\n\n* Revenue (30d): $${kpis.revenue30d.toLocaleString()} (${kpis.revDeltaPct >= 0 ? '+' : ''}${kpis.revDeltaPct.toFixed(1)}% vs prior).\n* Cash runway: ${kpis.runwayDays ?? '∞'} days.\n* ${overdue.length} overdue invoice(s) totaling $${overdue.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}.\n* ${anomalies.length} anomaly detected.\n\n_AI briefing unavailable: ${e.message}_`;
  }

  return NextResponse.json({ briefing, kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors });
}
