import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/rbac/guard';
import { usersRepo } from '@/lib/repositories/users';
import { profileSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET() {
  const u = await requireUser(); if ('error' in u) return u.error;
  const user = await usersRepo.findById(u.userId);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, image: user.image, createdAt: user.createdAt } });
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(); if ('error' in u) return u.error;
  const body = await req.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const user = await usersRepo.update(u.userId, parsed.data as any);
  return NextResponse.json({ user });
}
