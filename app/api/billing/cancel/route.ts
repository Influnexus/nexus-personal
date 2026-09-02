import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';
import { cancelSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  try {
    const sub = await subscriptionService.cancel(orgId, session.user.id, parsed.data.immediate ?? false);
    return NextResponse.json({ subscription: sub });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not cancel' }, { status: 400 });
  }
}
