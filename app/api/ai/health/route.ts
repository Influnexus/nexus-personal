import { NextResponse } from 'next/server';
import { getAiHealth } from '@/lib/ai/provider';

export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json(getAiHealth());
}
