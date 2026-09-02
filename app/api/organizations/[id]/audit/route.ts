import { NextRequest, NextResponse } from 'next/server';
import { requireOrgPermission } from '@/lib/rbac/guard';
import { auditRepo } from '@/lib/repositories/auditLogs';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOrgPermission(id, 'audit:read'); if ('error' in g) return g.error;
  const logs = await auditRepo.list(id, 30);
  return NextResponse.json({ logs });
}
