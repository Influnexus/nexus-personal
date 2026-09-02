import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import Razorpay from 'razorpay';
import { PLANS } from '@/lib/billing/plans';
import { planChangeSchema } from '@/lib/validation/schemas';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Backend endpoint to create a Razorpay Order for Standard Checkout (one-time payment collected
// to activate/renew a subscription period). Amount is derived server-side from the plan catalog —
// never trust a client-supplied amount.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const rl = rateLimit(`razorpay-order:${orgId}`, 10, 10 * 60_000); // 10 order attempts / 10min / org
  if (!rl.allowed) return NextResponse.json({ error: 'Too many checkout attempts. Please wait a few minutes and try again.' }, { status: 429 });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return NextResponse.json({ error: 'Razorpay is not configured yet.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = planChangeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const { plan, interval } = parsed.data;

  const def = PLANS[plan];
  if (!def || def.priceMonthlyInr == null) return NextResponse.json({ error: 'This plan is not available for self-serve checkout.' }, { status: 400 });

  const rupees = interval === 'monthly' ? def.priceMonthlyInr : Math.round(def.priceMonthlyInr * 12 * (1 - def.yearlyDiscountPct / 100));
  const amountPaise = Math.round(rupees * 100);
  if (amountPaise < 100) return NextResponse.json({ error: 'Amount must be at least 100 paise.' }, { status: 400 });

  try {
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await instance.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `org_${orgId.slice(0, 8)}_${Date.now()}`,
      notes: { organizationId: orgId, plan, interval },
    } as any);

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      plan,
      interval,
    });
  } catch (e: any) {
    console.error('[razorpay] order creation failed', e?.message || e);
    return NextResponse.json({ error: 'Could not create Razorpay order. Please try again.' }, { status: 500 });
  }
}
