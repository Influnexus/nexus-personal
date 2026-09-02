import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';
import { selectProvider } from '@/lib/billing/providers/router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const sub = await subscriptionService.getSubscription(orgId);
  const region = sub?.region === 'IN' ? 'IN' : 'INTL';
  const provider = selectProvider(region);
  if (!sub?.providerCustomerId || !provider.isConfigured()) {
    return NextResponse.json({
      error: 'not_configured',
      message: 'Billing portal will be available once payment processing is connected. Manage your plan directly from this Billing page for now.',
    }, { status: 503 });
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL || '';
  const result = await provider.createCustomerPortalSession(sub.providerCustomerId, `${base}/billing`);
  return NextResponse.json(result);
}
