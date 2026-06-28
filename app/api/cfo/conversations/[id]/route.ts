import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { conversationsRepo } from '@/lib/repositories/conversations';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const c = await conversationsRepo.findById(id);
  if (!c || c.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ conversation: c });
}
