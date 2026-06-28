import { NextRequest, NextResponse } from 'next/server';
import { requireOrgPermission } from '@/lib/rbac/guard';
import { teamService } from '@/lib/services/team.service';
import { inviteSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOrgPermission(id, 'members:read'); if ('error' in g) return g.error;
  const invitations = await teamService.listInvitations(id);
  return NextResponse.json({ invitations });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOrgPermission(id, 'members:invite'); if ('error' in g) return g.error;
  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const inv = await teamService.invite(id, g.userId!, parsed.data.email, parsed.data.role);
  return NextResponse.json({ invitation: inv });
}
