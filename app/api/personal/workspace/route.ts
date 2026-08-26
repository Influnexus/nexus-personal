// Sprint P1 — minimal Personal workspace endpoint. Creates (or returns) the caller's personal
// workspace: an organization with kind='personal' and an OWNER membership. This deliberately
// reuses the existing org/membership infrastructure — tenant isolation, memory, billing and
// analytics all inherit automatically. No Enterprise route is touched.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { orgsRepo } from '@/lib/repositories/organizations';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { rateLimit } from '@/lib/rate-limit';
import { v4 as uuid } from 'uuid';

export const runtime = 'nodejs';

async function findPersonalWorkspace(userId: string) {
  const memberships = await membershipsRepo.listByUser(userId);
  if (memberships.length === 0) return null;
  const orgs = await orgsRepo.listByIds(memberships.map(m => m.organizationId));
  return orgs.find(o => o.kind === 'personal') ?? null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ws = await findPersonalWorkspace(session.user.id);
  return NextResponse.json({ workspace: ws });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`personal-ws:${session.user.id}`, 3, 10 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts — please try again later.' }, { status: 429 });

  // Idempotent: one personal workspace per user.
  const existing = await findPersonalWorkspace(session.user.id);
  if (existing) return NextResponse.json({ workspace: existing, created: false });

  const firstName = (session.user.name || 'My').split(' ')[0];
  const org = await orgsRepo.create({
    name: `${firstName}'s Personal Finances`,
    slug: `personal-${uuid().slice(0, 8)}`,
    ownerId: session.user.id,
    kind: 'personal',
  });
  await membershipsRepo.create({ userId: session.user.id, organizationId: org.id, role: 'OWNER' });
  return NextResponse.json({ workspace: org, created: true });
}
