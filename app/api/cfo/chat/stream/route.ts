// Streaming chat endpoint — Server-Sent Events. Emits tool-status events as the agent reasons,
// then streams the final answer token-by-token.

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { llm } from '@/lib/ai/provider';
import { toolSpecs, runTool } from '@/lib/ai/tools';
import { CFO_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { conversationsRepo } from '@/lib/repositories/conversations';
import { v4 as uuid } from 'uuid';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PRETTY: Record<string, string> = {
  get_kpis: 'Crunching the latest KPIs…',
  get_health_score: 'Scoring business health…',
  get_expense_breakdown: 'Slicing expenses by category…',
  get_top_vendors: 'Ranking top vendors…',
  get_anomalies: 'Scanning for unusual transactions…',
  list_overdue_invoices: 'Checking overdue invoices…',
  list_recent_transactions: 'Pulling recent transactions…',
  forecast_cash: 'Forecasting cash position…',
  get_recommendations: 'Preparing recommendations…',
  list_invoices: 'Loading invoices…',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return new Response('No active organization', { status: 400 });

  const { messages, conversationId } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) return new Response('messages required', { status: 400 });

  let convo = conversationId ? await conversationsRepo.findById(conversationId) : null;
  if (!convo) {
    const firstUser = messages.find((m: any) => m.role === 'user')?.content || 'New conversation';
    convo = await conversationsRepo.create({ organizationId: orgId, userId: session.user.id, title: String(firstUser).slice(0, 60) });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const close = () => controller.close();

      try {
        send('meta', { conversationId: convo!.id });
        const sys = { role: 'system' as const, content: CFO_SYSTEM_PROMPT };
        const ctxMsgs: any[] = [sys, ...messages];
        const usedTools: { name: string; result: any }[] = [];
        let finalAnswer = '';

        for (let step = 0; step < 6; step++) {
          // Non-streaming round to check for tool calls; once no more tools, do a streaming round for the final answer.
          const decision = await llm.complete({
            messages: ctxMsgs, tools: toolSpecs(), tool_choice: 'auto',
            temperature: 0.2, max_tokens: 1500,
          });

          if (decision.tool_calls && decision.tool_calls.length > 0) {
            ctxMsgs.push({ role: 'assistant', content: decision.content ?? null, tool_calls: decision.tool_calls });
            for (const tc of decision.tool_calls) {
              send('tool_start', { name: tc.function.name, label: PRETTY[tc.function.name] || `Running ${tc.function.name}…` });
              const out = await runTool(tc.function.name, tc.function.arguments, { organizationId: orgId });
              usedTools.push({ name: tc.function.name, result: out });
              send('tool_done', { name: tc.function.name });
              ctxMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });
            }
            continue;
          }

          // Final answer round — stream tokens.
          if (decision.content) {
            // We already have the final answer from this round (no tool calls). Stream it as one chunk for fidelity
            // plus we restart a streaming pass to feel live.
            const streamMsgs = [...ctxMsgs];
            send('answer_start', {});
            try {
              for await (const chunk of llm.stream({ messages: streamMsgs, temperature: 0.2, max_tokens: 1500 })) {
                if (chunk.delta) { finalAnswer += chunk.delta; send('token', { delta: chunk.delta }); }
              }
            } catch {
              // Fallback to the already-known content.
              finalAnswer = decision.content;
              send('token', { delta: decision.content });
            }
            send('answer_end', {});
            break;
          }
          break;
        }

        // Persist conversation
        const last = messages[messages.length - 1];
        await conversationsRepo.appendMessages(convo!.id, [
          { id: uuid(), role: 'user', content: typeof last.content === 'string' ? last.content : JSON.stringify(last.content), createdAt: new Date() },
          { id: uuid(), role: 'assistant', content: finalAnswer, tool_calls: usedTools, createdAt: new Date() },
        ]);

        send('done', { conversationId: convo!.id, toolCalls: usedTools.map(t => ({ name: t.name })) });
        close();
      } catch (e: any) {
        send('error', { message: e.message || 'AI error' });
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
