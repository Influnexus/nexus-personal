import { NextRequest, NextResponse } from 'next/server';
import { requireOrgPermission } from '@/lib/rbac/guard';
import { teamService } from '@/lib/services/team.service';
import { Role } from '@/lib/db/models';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  const g = await requireOrgPermission(id, 'members:remove'); if ('error' in g) return g.error;
  await teamService.removeMember(id, memberId, g.userId!);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  const g = await requireOrgPermission(id, 'members:update_role'); if ('error' in g) return g.error;
  const { role } = await req.json();
  await teamService.updateMemberRole(id, memberId, role as Role, g.userId!);
  return NextResponse.json({ ok: true });
}
