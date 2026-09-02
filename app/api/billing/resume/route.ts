import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  try {
    const sub = await subscriptionService.resume(orgId, session.user.id);
    return NextResponse.json({ subscription: sub });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not resume' }, { status: 400 });
  }
}
