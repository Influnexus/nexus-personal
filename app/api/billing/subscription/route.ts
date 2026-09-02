import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';
import { usageService } from '@/lib/billing/usage.service';
import { PLANS } from '@/lib/billing/plans';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const subscription = await subscriptionService.getEffectiveSubscription(orgId);
  const usage = await usageService.getUsageSummary(orgId);
  return NextResponse.json({ subscription, usage, plans: PLANS });
}
