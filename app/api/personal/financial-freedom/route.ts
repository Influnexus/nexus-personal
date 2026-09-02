// Financial Freedom / FI — deterministic assessment from the canonical personal profile.
// NO LLM math. Pure core computation.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { personalService } from '@/lib/services/personal.service';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) return NextResponse.json({ error: 'No personal workspace' }, { status: 404 });

  const mParam = Number(req.nextUrl.searchParams.get('multiplier'));
  const multiplier = Number.isFinite(mParam) && mParam > 0 ? mParam : undefined;

  const result = await personalService.getFinancialFreedom(ws, multiplier);

  trackServer('personal_financial_freedom_viewed', {
    userId: session.user.id, organizationId: ws.id, isDemo: !!ws.isDemo,
    meta: { feature: result.freedom.status },
  });

  return NextResponse.json(result);
}
