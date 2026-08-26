// Sprint P3 — Personal alerts API. Returns all deterministic financial alerts.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { personalService } from '@/lib/services/personal.service';
import { trackServer } from '@/lib/analytics/track-server';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ws = await personalService.findWorkspaceForUser(session.user.id);
    if (!ws) return NextResponse.json({ error: 'No personal workspace found' }, { status: 404 });

    const result = await personalService.getAlerts(ws);

    // Privacy-safe analytics: no financial values
    trackServer('personal_alerts_viewed', { userId: session.user.id, organizationId: ws.id, isDemo: !!ws.isDemo });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[personal/alerts] Error:', e.message);
    return NextResponse.json({ error: 'Failed to compute alerts' }, { status: 500 });
  }
}
