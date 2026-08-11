// Public event ingestion endpoint. Rate-limited, whitelist-validated and sanitized —
// see lib/analytics/events.ts for the privacy guarantees. Always returns 200-ish fast;
// analytics must never disrupt the product experience.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { analyticsRepo } from '@/lib/analytics/repo';
import { isAllowedEvent, sanitizeMeta, sanitizeId, sanitizePage } from '@/lib/analytics/events';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`track:${ip}`, 120, 60_000); // 120 events / minute / IP
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const event = typeof body?.event === 'string' ? body.event : '';
  if (!isAllowedEvent(event)) return NextResponse.json({ ok: false, error: 'unknown_event' }, { status: 400 });

  // Attach authenticated identity server-side (never trust client-sent user/org ids).
  const session = await auth().catch(() => null);

  analyticsRepo.track({
    event,
    visitorId: sanitizeId(body.visitorId),
    sessionId: sanitizeId(body.sessionId),
    userId: session?.user?.id ?? null,
    organizationId: session?.user?.activeOrgId ?? null,
    isDemo: !!session?.user?.isDemo,
    page: sanitizePage(body.page),
    meta: sanitizeMeta(body.meta),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
