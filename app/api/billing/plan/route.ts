import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';
import { planChangeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const body = await req.json();
  const parsed = planChangeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  try {
    const sub = await subscriptionService.changePlan(orgId, session.user.id, parsed.data.plan, parsed.data.interval);
    return NextResponse.json({ subscription: sub });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not change plan' }, { status: 400 });
  }
}
