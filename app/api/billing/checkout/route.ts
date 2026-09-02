import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { selectProvider, Region } from '@/lib/billing/providers/router';
import { planChangeSchema } from '@/lib/validation/schemas';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = planChangeSchema.extend({ region: z.enum(['IN', 'INTL']) });

// Creates a real checkout session with the correct provider (Stripe/Razorpay) once keys exist.
// Until then, isConfigured() is false and we return a clear, honest 503 — never a fake success.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const provider = selectProvider(parsed.data.region as Region);
  if (!provider.isConfigured()) {
    return NextResponse.json({
      error: 'not_configured',
      message: `Payment processing (${provider.name}) is being finalized. You can continue on your free trial — we'll notify you when checkout is available.`,
      provider: provider.name,
    }, { status: 503 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL || '';
  try {
    const result = await provider.createCheckoutSession({
      organizationId: orgId,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      customerEmail: session.user.email,
      successUrl: `${base}/billing?checkout=success`,
      cancelUrl: `${base}/billing?checkout=canceled`,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not start checkout' }, { status: 500 });
  }
}
