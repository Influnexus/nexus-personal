import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { memoryService } from '@/lib/memory/service';
import { memoriesRepo } from '@/lib/memory/repo';
import { auditRepo } from '@/lib/repositories/auditLogs';
import { memoryCreateSchema } from '@/lib/validation/schemas';
import { MemoryCategory } from '@/lib/db/models';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ memories: { business: [], financial: [], goal: [], decision: [], preference: [] } });
  const grouped = await memoryService.listGrouped(orgId);
  return NextResponse.json({ memories: grouped });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const body = await req.json();
  const parsed = memoryCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const mem = await memoriesRepo.create({
    organizationId: orgId, category: parsed.data.category, label: parsed.data.label, value: parsed.data.value,
    source: 'user', agent: 'cfo',
  });
  await auditRepo.log({ userId: session.user.id, organizationId: orgId, action: 'memory.create', metadata: { category: mem.category, label: mem.label } });
  trackServer('memory_used', { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo, meta: { feature: 'create' } });
  return NextResponse.json({ memory: mem });
}

// Reset memories — optionally scoped to a single category via ?category=goal
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const category = req.nextUrl.searchParams.get('category') as MemoryCategory | null;
  const deleted = await memoriesRepo.removeAllByOrg(orgId, category || undefined);
  await auditRepo.log({ userId: session.user.id, organizationId: orgId, action: 'memory.reset', metadata: { category: category || 'all', deleted } });
  return NextResponse.json({ deleted });
}
