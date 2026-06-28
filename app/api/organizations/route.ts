import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/rbac/guard';
import { orgService } from '@/lib/services/organization.service';
import { createOrgSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET() {
  const u = await requireUser(); if ('error' in u) return u.error;
  const orgs = await orgService.listForUser(u.userId);
  return NextResponse.json({ organizations: orgs });
}

export async function POST(req: NextRequest) {
  const u = await requireUser(); if ('error' in u) return u.error;
  const body = await req.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  try {
    const org = await orgService.create(u.userId, parsed.data);
    return NextResponse.json({ organization: org });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
