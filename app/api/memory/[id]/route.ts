import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { memoriesRepo } from '@/lib/memory/repo';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { memoryUpdateSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });
  const { id } = await params;

  const existing = await memoriesRepo.findById(id, orgId);
  if (!existing) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });

  const body = await req.json();
  const parsed = memoryUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const updated = await memoriesRepo.update(id, orgId, parsed.data);
  await auditRepo.log({ userId: session.user.id, organizationId: orgId, action: 'memory.update', metadata: { id } });
  return NextResponse.json({ memory: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });
  const { id } = await params;

  const existing = await memoriesRepo.findById(id, orgId);
  if (!existing) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });

  await memoriesRepo.remove(id, orgId);
  await auditRepo.log({ userId: session.user.id, organizationId: orgId, action: 'memory.delete', metadata: { id } });
  return NextResponse.json({ ok: true });
}
