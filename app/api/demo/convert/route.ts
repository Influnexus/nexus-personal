import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { demoService } from '@/lib/services/demo.service';
import { registerSchema } from '@/lib/validation/schemas';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const result = await demoService.convertToReal(session.user.id, parsed.data);
    trackServer('demo_converted', { userId: session.user.id, organizationId: session.user.activeOrgId });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Conversion failed' }, { status: 400 });
  }
}
