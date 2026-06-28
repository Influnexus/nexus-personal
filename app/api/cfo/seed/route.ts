import { NextRequest, NextResponse } from 'next/server';
import { requireOrgPermission } from '@/lib/rbac/guard';
import { seedService } from '@/lib/services/seed.service';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  const { auth } = await import('@/auth');
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });
  const g = await requireOrgPermission(session.user.activeOrgId, 'org:update'); if ('error' in g) return g.error;
  const r = await seedService.seedOrg(session.user.activeOrgId);
  return NextResponse.json(r);
}
