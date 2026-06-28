import { auth } from '@/auth';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { can, Permission } from './permissions';
import { NextResponse } from 'next/server';

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId: session.user.id, session };
}

export async function requireOrgPermission(orgId: string, perm: Permission) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const m = await membershipsRepo.find(session.user.id, orgId);
  if (!m) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!can(m.role, perm)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { userId: session.user.id, role: m.role, session };
}
