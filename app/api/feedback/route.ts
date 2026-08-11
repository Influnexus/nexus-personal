// Beta feedback + problem reports. Auth required (widget lives inside the app / demo mode).
// Free-text is capped and stored only in the dedicated feedback collection.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { analyticsRepo, FeedbackRating } from '@/lib/analytics/repo';
import { sanitizePage, sanitizeId } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/track-server';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATINGS: FeedbackRating[] = ['very_useful', 'useful', 'neutral', 'not_useful', 'broken'];
const FEATURES = ['dashboard', 'cfo_chat', 'invoices', 'csv_import', 'reports', 'forecast', 'memory', 'billing', 'demo', 'other'];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`feedback:${session.user.id}`, 10, 10 * 60_000); // 10 submissions / 10min / user
  if (!rl.allowed) return NextResponse.json({ error: 'Too many submissions — please try again later.' }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const type = body?.type === 'problem' ? 'problem' : 'rating';

  let rating: FeedbackRating | null = null;
  if (type === 'rating') {
    if (!RATINGS.includes(body?.rating)) return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    rating = body.rating;
  }

  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : null;
  if (type === 'problem' && !text) return NextResponse.json({ error: 'Please describe the problem.' }, { status: 400 });

  const feature = FEATURES.includes(body?.feature) ? body.feature : null;

  const doc = await analyticsRepo.createFeedback({
    type,
    rating,
    text: text || null,
    page: sanitizePage(body?.page),
    feature,
    errorId: sanitizeId(body?.errorId),
    userId: session.user.id,
    organizationId: session.user.activeOrgId ?? null,
    isDemo: !!session.user.isDemo,
  });

  trackServer(type === 'problem' ? 'problem_reported' : 'feedback_submitted', {
    userId: session.user.id,
    organizationId: session.user.activeOrgId,
    isDemo: session.user.isDemo,
    meta: { feature: feature || undefined, status: rating || undefined } as any,
  });

  return NextResponse.json({ ok: true, id: doc.id });
}
