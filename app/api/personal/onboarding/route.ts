// Sprint P2 — Personal onboarding. Collects the minimal financial profile (no bank credentials,
// no unnecessary PII), creates/uses the personal workspace, stores the profile on the org and
// seeds a realistic deterministic history so the shared core can compute immediately.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { orgsRepo } from '@/lib/repositories/organizations';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { personalService } from '@/lib/services/personal.service';
import { trackServer } from '@/lib/analytics/track-server';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const money = z.number().min(0).max(1_000_000_000);
const onboardingSchema = z.object({
  monthlyIncome: money,
  essentialMonthly: money,
  discretionaryMonthly: money,
  cash: money,
  investments: money,
  totalDebt: money,
  monthlyDebtPayment: money,
  goal: z.string().trim().max(120).optional().nullable(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']).default('INR'),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ws = await personalService.findWorkspaceForUser(session.user.id);
  const summary = ws ? await personalService.getOnboardingSummary(ws) : null;
  return NextResponse.json({ workspace: ws ? { id: ws.id, name: ws.name } : null, profile: ws?.personalProfile ?? null, summary });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`personal-onboard:${session.user.id}`, 5, 10 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts — please try again in a few minutes.' }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });

  // Create the personal workspace if the user doesn't have one yet (idempotent).
  let ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) {
    const firstName = (session.user.name || 'My').split(' ')[0];
    ws = await orgsRepo.create({
      name: `${firstName}'s Personal Finances`,
      slug: `personal-${uuid().slice(0, 8)}`,
      ownerId: session.user.id,
      kind: 'personal',
    });
    await membershipsRepo.create({ userId: session.user.id, organizationId: ws.id, role: 'OWNER' });
  }

  const profile = { ...parsed.data, goal: parsed.data.goal || null, updatedAt: new Date() };
  await orgsRepo.update(ws.id, { personalProfile: profile } as any);

  // NO fabricated transactions for real users. Analytics stay empty until the user imports real
  // transactions; all headline metrics/forecast/FI derive deterministically from this profile.
  // Re-fetch the saved workspace and recompute metrics so the client can show a confirmation.
  const saved = await orgsRepo.findById(ws.id);
  const summary = saved ? await personalService.getOnboardingSummary(saved as any) : null;

  trackServer('personal_onboarding_completed', { userId: session.user.id, organizationId: ws.id, isDemo: session.user.isDemo });
  return NextResponse.json({ ok: true, workspaceId: ws.id, summary });
}
