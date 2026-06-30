import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { financeService } from '@/lib/services/finance.service';
import { llm } from '@/lib/ai/provider';
import { CFO_SYSTEM_PROMPT } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId; if (!orgId) return NextResponse.json({ error: 'No active org' }, { status: 400 });

  const [kpis, health, breakdown, vendors, anomalies, overdue, recs, forecast] = await Promise.all([
    financeService.kpis(orgId),
    financeService.healthScore(orgId),
    financeService.expenseBreakdown(orgId, 30),
    financeService.topVendors(orgId, 90),
    financeService.anomalies(orgId),
    financeService.overdueInvoices(orgId),
    financeService.recommendations(orgId),
    financeService.cashflowForecast(orgId, 90),
  ]);

  const ctx = { kpis, health, breakdown, vendors, anomalies, overdue: overdue.slice(0, 5), recs, forecast: { startingCash: forecast.startingCash, endingCash: forecast.endingCash, lowestDay: forecast.lowestDay, narrative: forecast.narrative, scheduledEvents: forecast.scheduledEvents } };

  const prompt = `Generate an executive monthly financial report. Use ONLY the data provided in CONTEXT. Output markdown with these exact sections (use ## headings):
## Executive Summary
## Monthly Financial Summary
## Revenue Breakdown
## Expense Breakdown
## Cash Flow Outlook
## Top Risks
## Opportunities
## Action Items

Be concise, specific, and use real numbers. End with a one-line confidence statement.`;

  const res = await llm.complete({
    messages: [
      { role: 'system', content: CFO_SYSTEM_PROMPT },
      { role: 'user', content: `${prompt}\n\nCONTEXT:\n${JSON.stringify(ctx).slice(0, 14000)}` },
    ],
    temperature: 0.4, max_tokens: 3000,
  });
  return NextResponse.json({ markdown: res.content || '', context: ctx });
}
