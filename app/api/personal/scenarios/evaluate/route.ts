// Sprint P4 — Deterministic scenario evaluation. NO LLM. Pure math.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { personalService } from '@/lib/services/personal.service';
import { evaluatePersonalScenario, PersonalScenarioLevers } from '@/lib/core/finance';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { trackServer } from '@/lib/analytics/track-server';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ws = await personalService.findWorkspaceForUser(session.user.id);
    if (!ws) return NextResponse.json({ error: 'No personal workspace found' }, { status: 404 });

    const body = await req.json();
    const levers: PersonalScenarioLevers = body.levers || {};

    // Canonical base history + profile (single source of truth; works with zero real transactions).
    const ctx = await personalService.buildToolContext(ws);

    const result = evaluatePersonalScenario({
      txs: ctx.txs,
      levers,
      profile: { monthlyDebtPayment: ctx.profile?.monthlyDebtPayment },
      baseState: ctx.state ? { cash: ctx.state.cash, income30d: ctx.state.income30d, spend30d: ctx.state.spend30d, surplus30d: ctx.state.surplus30d } : undefined,
    });

    // Privacy-safe analytics — no financial values
    trackServer('personal_scenario_completed', {
      userId: session.user.id,
      organizationId: ws.id,
      isDemo: !!ws.isDemo,
      meta: { feature: result.verdict.level },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[personal/scenarios/evaluate] Error:', e.message);
    return NextResponse.json({ error: 'Failed to evaluate scenario' }, { status: 500 });
  }
}
