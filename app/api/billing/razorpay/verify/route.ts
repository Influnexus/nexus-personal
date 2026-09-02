import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { subscriptionsRepo, billingInvoicesRepo } from '@/lib/billing/repo';
import { PLANS } from '@/lib/billing/plans';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Backend endpoint to verify a completed Razorpay Standard Checkout payment.
// Algorithm per Razorpay docs: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET), compared to
// the signature returned by checkout. Only marks the subscription active if signatures match —
// otherwise we do NOT trust anything the client claims about payment success.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keySecret || !keyId) return NextResponse.json({ error: 'Razorpay is not configured yet.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Missing required fields', details: parsed.error.flatten() }, { status: 400 });
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data;

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    console.warn('[razorpay] signature mismatch for order', razorpay_order_id);
    return NextResponse.json({ error: 'Payment verification failed — signature mismatch.', verified: false }, { status: 400 });
  }

  // Signature is valid. Re-fetch the order from Razorpay to read its notes (plan/interval/org) —
  // never trust plan/amount values from the client directly, even post-verification.
  try {
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await instance.orders.fetch(razorpay_order_id);
    const notes: any = order.notes || {};
    if (notes.organizationId && notes.organizationId !== orgId) {
      return NextResponse.json({ error: 'Order does not belong to this organization.', verified: false }, { status: 400 });
    }
    const plan = (notes.plan || 'starter') as 'starter' | 'growth';
    const interval = (notes.interval || 'monthly') as 'monthly' | 'yearly';
    const amountRupees = Number(order.amount) / 100;
    const now = new Date();
    const periodDays = interval === 'yearly' ? 365 : 30;

    const existing = await subscriptionsRepo.findByOrg(orgId);
    if (existing) {
      await subscriptionsRepo.update(orgId, {
        plan, interval, status: 'active', provider: 'razorpay',
        providerSubscriptionId: razorpay_order_id, // order-based (Standard Checkout), not a recurring subscription id
        currentPeriodStart: now, currentPeriodEnd: addDays(now, periodDays),
        cancelAtPeriodEnd: false, canceledAt: null,
      });
    } else {
      await subscriptionsRepo.create({
        organizationId: orgId, plan, interval, status: 'active', provider: 'razorpay',
        providerSubscriptionId: razorpay_order_id, providerCustomerId: null,
        trialStartedAt: null, trialEndsAt: null,
        currentPeriodStart: now, currentPeriodEnd: addDays(now, periodDays),
        cancelAtPeriodEnd: false, canceledAt: null, region: 'IN',
      });
    }

    const sub = await subscriptionsRepo.findByOrg(orgId);
    await billingInvoicesRepo.create({
      organizationId: orgId, subscriptionId: sub!.id, provider: 'razorpay',
      providerInvoiceId: razorpay_payment_id, amount: amountRupees, currency: 'INR',
      status: 'paid', periodStart: now, periodEnd: addDays(now, periodDays), pdfUrl: null, issuedAt: now,
    });

    await auditRepo.log({ userId: session.user.id, organizationId: orgId, action: 'billing.razorpay_payment_verified', metadata: { plan, interval, amountRupees, paymentId: razorpay_payment_id } });

    return NextResponse.json({ verified: true, plan, interval });
  } catch (e: any) {
    console.error('[razorpay] verification post-processing failed', e?.message || e);
    return NextResponse.json({ error: 'Payment verified but activation failed — contact support.', verified: true, activationError: true }, { status: 500 });
  }
}
