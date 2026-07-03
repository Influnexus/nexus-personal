import { NextRequest, NextResponse } from 'next/server';
import { stripeProvider } from '@/lib/billing/providers/stripe.provider';
import { webhookEventsRepo, subscriptionsRepo } from '@/lib/billing/repo';

export const runtime = 'nodejs';

// Webhook architecture (Phase 4A: skeleton + signature verification wired; Phase 4B: enable once
// STRIPE_WEBHOOK_SECRET is set). Always reads the RAW body — required for signature verification.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!stripeProvider.isConfigured()) {
    // Not configured yet — acknowledge so Stripe doesn't retry forever once a webhook exists,
    // but do nothing (there are no real events to process without keys).
    return NextResponse.json({ received: true, note: 'Stripe not configured' });
  }

  const valid = stripeProvider.verifyWebhookSignature(rawBody, signature);
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }

  // Idempotency — skip if we've already processed this event id.
  const existing = await webhookEventsRepo.findByEventId('stripe', event.id);
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  const record = await webhookEventsRepo.create({ provider: 'stripe', eventId: event.id, type: event.type, payload: event, status: 'received' });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const orgId = sub.metadata?.organizationId;
        if (orgId) {
          const isActive = sub.status === 'active' || sub.status === 'trialing';
          await subscriptionsRepo.update(orgId, {
            status: isActive ? 'active' : sub.status,
            providerSubscriptionId: sub.id,
            providerCustomerId: sub.customer,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const orgId = sub.metadata?.organizationId;
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'canceled', canceledAt: new Date() });
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const orgId = invoice.metadata?.organizationId;
        if (orgId) await subscriptionsRepo.update(orgId, { status: 'past_due' });
        break;
      }
      default:
        break; // ignore other event types
    }
    await webhookEventsRepo.markProcessed(record.id, 'processed');
  } catch (e: any) {
    await webhookEventsRepo.markProcessed(record.id, 'failed', e.message);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
