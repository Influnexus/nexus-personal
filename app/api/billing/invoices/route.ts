import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { invoiceService } from '@/lib/billing/invoice.service';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ invoices: [] });
  const invoices = await invoiceService.listForOrg(orgId);
  return NextResponse.json({ invoices });
}
