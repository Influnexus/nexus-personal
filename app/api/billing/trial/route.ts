import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { subscriptionService } from '@/lib/billing/subscription.service';
import { emailTemplates } from '@/lib/billing/email-templates';
import { PLANS } from '@/lib/billing/plans';
import { trialStartSchema } from '@/lib/validation/schemas';
import { orgsRepo } from '@/lib/repositories/organizations';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const body = await req.json();
  const parsed = trialStartSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  try {
    const sub = await subscriptionService.startTrial(orgId, session.user.id, parsed.data.plan, parsed.data.interval, parsed.data.region);
    trackServer('trial_started', { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo, meta: { feature: parsed.data.plan } });
    const org = await orgsRepo.findById(orgId);
    // Email is generated but not sent yet — no mailer is configured. Kept here so wiring a
    // provider later (SendGrid/SES) is a one-line change, not a redesign.
    const email = emailTemplates.trialStarted(org?.name || 'there', PLANS[parsed.data.plan], sub.trialEndsAt!);
    return NextResponse.json({ subscription: sub, emailPreview: email });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not start trial' }, { status: 400 });
  }
}
