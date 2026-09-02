import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { registerSchema } from '@/lib/validation/schemas';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, 8, 10 * 60_000); // 8 registrations / 10min / IP
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const user = await authService.register(parsed.data);
    trackServer('signup_completed', { userId: user.id });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Registration failed' }, { status: 400 });
  }
}
