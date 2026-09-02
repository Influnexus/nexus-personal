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

    const txs = await transactionsRepo.listByOrg(ws.id);
    const profile = ws.personalProfile;

    const result = evaluatePersonalScenario({
      txs,
      levers,
      profile: { monthlyDebtPayment: profile?.monthlyDebtPayment },
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
