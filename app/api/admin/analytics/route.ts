// Private founder/admin analytics view — gated by FOUNDER_EMAILS env allowlist.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isFounderEmail } from '@/lib/analytics/founder';
import { analyticsService } from '@/lib/analytics/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFounderEmail(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden — founder access only' }, { status: 403 });
  }
  const raw = parseInt(req.nextUrl.searchParams.get('range') || '30', 10);
  const range = Math.min(90, Math.max(7, isNaN(raw) ? 30 : raw));
  const data = await analyticsService.dashboard(range);
  return NextResponse.json(data);
}
