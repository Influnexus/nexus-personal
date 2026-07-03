import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runCfoAgent } from '@/lib/ai/agent';
import { conversationsRepo } from '@/lib/repositories/conversations';
import { memoryService } from '@/lib/memory/service';
import { LLMUnavailableError } from '@/lib/ai/provider';
import { v4 as uuid } from 'uuid';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const { messages, conversationId } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  let convo = conversationId ? await conversationsRepo.findById(conversationId) : null;
  if (!convo) {
    const firstUser = messages.find((m: any) => m.role === 'user')?.content || 'New conversation';
    convo = await conversationsRepo.create({ organizationId: orgId, userId: session.user.id, title: String(firstUser).slice(0, 60) });
  }

  try {
    const trace = await runCfoAgent(messages, { organizationId: orgId }, { maxSteps: 6, temperature: 0.3 });
    const now = new Date();
    const userMsg = messages[messages.length - 1];
    await conversationsRepo.appendMessages(convo.id, [
      { id: uuid(), role: 'user', content: typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content), createdAt: now },
      { id: uuid(), role: 'assistant', content: trace.finalAnswer, tool_calls: trace.toolCalls, createdAt: new Date() },
    ]);
    const userText = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
    memoryService.extractMemoriesFromTurn(orgId, 'cfo', userText, convo.id).catch(() => {});
    return NextResponse.json({ conversationId: convo.id, answer: trace.finalAnswer, toolCalls: trace.toolCalls });
  } catch (e: any) {
    if (e instanceof LLMUnavailableError) {
      return NextResponse.json({ error: 'ai_unavailable', message: 'The AI is temporarily unavailable. Please try again in a few moments.' }, { status: 503 });
    }
    console.error('[chat] error', e?.message);
    return NextResponse.json({ error: 'internal', message: 'Something went wrong.' }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ conversations: [] });
  const list = await conversationsRepo.listByUser(orgId, session.user.id);
  return NextResponse.json({ conversations: list.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })) });
}
