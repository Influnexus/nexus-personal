import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { paymentMethodsRepo } from '@/lib/billing/repo';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ paymentMethods: [] });
  const methods = await paymentMethodsRepo.listByOrg(orgId);
  return NextResponse.json({ paymentMethods: methods });
}
