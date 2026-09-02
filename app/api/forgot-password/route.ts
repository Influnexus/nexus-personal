import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Stub: in production, dispatch reset email. For Sprint 1 UI only.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
  return NextResponse.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
}
