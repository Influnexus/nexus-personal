import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/rbac/guard';
import { teamService } from '@/lib/services/team.service';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const u = await requireUser(); if ('error' in u) return u.error;
  const { token } = await params;
  try {
    const inv = await teamService.acceptInvitation(token, u.userId);
    return NextResponse.json({ ok: true, organizationId: inv.organizationId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
