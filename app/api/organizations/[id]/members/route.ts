import { NextRequest, NextResponse } from 'next/server';
import { requireOrgPermission } from '@/lib/rbac/guard';
import { teamService } from '@/lib/services/team.service';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOrgPermission(id, 'members:read'); if ('error' in g) return g.error;
  const members = await teamService.listMembers(id);
  return NextResponse.json({ members });
}
