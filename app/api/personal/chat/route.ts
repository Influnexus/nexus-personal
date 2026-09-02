// Sprint P5 — Ask Nexus Personal streaming chat API. SSE endpoint.
// LLM understands intent + explains results. Deterministic tools calculate all financial numbers.
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { llm, LLMUnavailableError } from '@/lib/ai/provider';
import { personalToolSpecs, runPersonalTool, PersonalToolContext } from '@/lib/ai/personal-tools';
import { PERSONAL_SYSTEM_PROMPT, PERSONAL_TOOL_LABELS } from '@/lib/ai/personal-agent';
import { compactMessages } from '@/lib/ai/context';
import { memoryService } from '@/lib/memory/service';
import { personalService } from '@/lib/services/personal.service';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { trackServer } from '@/lib/analytics/track-server';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) return new Response('No personal workspace', { status: 404 });

  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) return new Response('messages required', { status: 400 });

  // Rate limit
  const rl = rateLimit(`pchat:${ws.id}`, 15, 60_000);
  if (!rl.allowed) {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({
      start(c) { c.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ code: 'rate_limited', message: 'Please wait a moment before sending another message.' })}\n\n`)); c.close(); }
    }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }

  // Pre-fetch transactions and profile once for all tool calls in this request
  const txs = await transactionsRepo.listByOrg(ws.id);
  const profile = ws.personalProfile;
  const currency = profile?.currency || txs[0]?.currency || 'INR';
  const toolCtx: PersonalToolContext = {
    organizationId: ws.id,
    txs,
    profile: { monthlyDebtPayment: profile?.monthlyDebtPayment, currency, goal: profile?.goal },
    currency,
  };

  // Privacy-safe analytics
  trackServer('personal_chat_question', { userId: session.user.id, organizationId: ws.id, isDemo: !!ws.isDemo });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const close = () => controller.close();

      try {
        // Build messages with memory
        const memoryContext = await memoryService.getMemoryContext(ws.id).catch(() => '');
        const sys = { role: 'system' as const, content: PERSONAL_SYSTEM_PROMPT + (memoryContext ? `\n\nPERSONAL MEMORY:\n${memoryContext}` : '') };
        const compacted = await compactMessages(messages);
        const ctxMsgs: any[] = [sys, ...compacted];
        const usedTools: { name: string; result: any }[] = [];
        let finalAnswer = '';

        for (let step = 0; step < 6; step++) {
          const decision = await llm.complete({
            messages: ctxMsgs, tools: personalToolSpecs(), tool_choice: 'auto',
            temperature: 0.2, max_tokens: 1500,
          });

          if (decision.tool_calls && decision.tool_calls.length > 0) {
            ctxMsgs.push({ role: 'assistant', content: decision.content ?? null, tool_calls: decision.tool_calls });
            for (const tc of decision.tool_calls) {
              send('tool_start', { name: tc.function.name, label: PERSONAL_TOOL_LABELS[tc.function.name] || `Analyzing…` });
              const out = await runPersonalTool(tc.function.name, tc.function.arguments, toolCtx);
              usedTools.push({ name: tc.function.name, result: out });
              send('tool_done', { name: tc.function.name });
              ctxMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });

              // Privacy-safe: log tool name only
              trackServer('personal_chat_tool_used', { userId: session.user.id, organizationId: ws.id, meta: { feature: tc.function.name } });
            }
            continue;
          }

          // Final answer — stream tokens
          if (decision.content) {
            send('answer_start', {});
            try {
              for await (const chunk of llm.stream({ messages: ctxMsgs, tools: personalToolSpecs(), tool_choice: 'none', temperature: 0.2, max_tokens: 1500 })) {
                if (chunk.delta) { finalAnswer += chunk.delta; send('token', { delta: chunk.delta }); }
              }
              if (!finalAnswer) { finalAnswer = decision.content; send('token', { delta: decision.content }); }
            } catch {
              finalAnswer = decision.content;
              send('token', { delta: decision.content });
            }
            send('answer_end', {});
            break;
          }
          break;
        }

        send('done', { toolCalls: usedTools.map(t => ({ name: t.name })) });
        close();

        trackServer('personal_chat_completed', { userId: session.user.id, organizationId: ws.id, isDemo: !!ws.isDemo });

        // Memory extraction (best-effort, non-blocking)
        const lastUser = messages[messages.length - 1];
        const lastText = typeof lastUser?.content === 'string' ? lastUser.content : '';
        if (lastText) memoryService.extractMemoriesFromTurn(ws.id, 'personal', lastText).catch(() => {});
      } catch (e: any) {
        const isUnavailable = e instanceof LLMUnavailableError;
        send('error', {
          code: isUnavailable ? 'ai_unavailable' : 'internal',
          message: isUnavailable
            ? 'Nexus AI is temporarily unavailable. Your financial dashboards and tools continue to work — try again in a moment.'
            : 'Something went wrong. Please try again.',
        });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
