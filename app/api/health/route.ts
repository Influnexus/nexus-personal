import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/mongo';
export const runtime = 'nodejs';
export async function GET() {
  try { await getDb(); return NextResponse.json({ status: 'ok' }); }
  catch (e: any) { return NextResponse.json({ status: 'error', error: e.message }, { status: 500 }); }
}
