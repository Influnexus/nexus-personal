import { NextRequest, NextResponse } from 'next/server';
import { razorpayProvider } from '@/lib/billing/providers/razorpay.provider';
import { webhookEventsRepo, subscriptionsRepo } from '@/lib/billing/repo';

export const runtime = 'nodejs';

// Webhook architecture (Phase 4A: skeleton + signature verification wired; Phase 4B: enable once
// RAZORPAY_WEBHOOK_SECRET is set). Always reads the RAW body — required for HMAC verification.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!razorpayProvider.isConfigured()) {
    return NextResponse.json({ received: true, note: 'Razorpay not configured' });
  }

  const valid = razorpayProvider.verifyWebhookSignature(rawBody, signature);
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }

  const eventId = req.headers.get('x-razorpay-event-id') || `${payload.event}-${Date.now()}`;
  const existing = await webhookEventsRepo.findByEventId('razorpay', eventId);
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  const record = await webhookEventsRepo.create({ provider: 'razorpay', eventId, type: payload.event, payload, status: 'received' });

  try {
    const entity = payload.payload?.subscription?.entity;
    const orgId = entity?.notes?.organizationId;
    switch (payload.event) {
      case 'subscription.activated':
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'active', providerSubscriptionId: entity.id });
        break;
      case 'subscription.cancelled':
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'canceled', canceledAt: new Date() });
        break;
      case 'subscription.charged':
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'active' });
        break;
      case 'payment.failed':
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'past_due' });
        break;
      default:
        break;
    }
    await webhookEventsRepo.markProcessed(record.id, 'processed');
  } catch (e: any) {
    await webhookEventsRepo.markProcessed(record.id, 'failed', e.message);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
