// Streaming chat endpoint — Server-Sent Events. Emits tool-status events as the agent reasons,
// then streams the final answer token-by-token.

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { llm, LLMUnavailableError } from '@/lib/ai/provider';
import { toolSpecs, runTool } from '@/lib/ai/tools';
import { toolCache } from '@/lib/ai/tool-cache';
import { CFO_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { compactMessages } from '@/lib/ai/context';
import { memoryService } from '@/lib/memory/service';
import { usageService } from '@/lib/billing/usage.service';
import { rateLimit } from '@/lib/rate-limit';
import { conversationsRepo } from '@/lib/repositories/conversations';
import { trackServer } from '@/lib/analytics/track-server';
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

  // Burst-rate guard (separate from monthly usage limits) — protects against rapid-fire abuse
  // hammering the LLM within a short window, regardless of monthly quota remaining.
  const burstRl = rateLimit(`chat:${orgId}`, 20, 60_000); // 20 messages / minute / org
  if (!burstRl.allowed) {
    const encoder = new TextEncoder();
    const limited = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ code: 'rate_limited', message: 'Too many messages sent too quickly — please wait a moment before trying again.' })}\n\n`));
        controller.close();
      },
    });
    return new Response(limited, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }

  // Usage gating — checked BEFORE any expensive LLM call so blocked usage costs nothing.
  const entitlement = await usageService.checkEntitlement(orgId, 'ai_messages');
  if (!entitlement.allowed) {
    const encoder = new TextEncoder();
    const gated = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ code: 'usage_limit', message: entitlement.reason })}\n\n`));
        controller.close();
      },
    });
    return new Response(gated, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }

  let convo = conversationId ? await conversationsRepo.findById(conversationId) : null;
  if (!convo) {
    const firstUser = messages.find((m: any) => m.role === 'user')?.content || 'New conversation';
    convo = await conversationsRepo.create({ organizationId: orgId, userId: session.user.id, title: String(firstUser).slice(0, 60) });
  }

  // Analytics: question asked (event name + ids only — never the message content).
  trackServer('cfo_question', { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo, meta: { first: messages.length === 1 } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const close = () => controller.close();

      try {
        send('meta', { conversationId: convo!.id });
        const memoryContext = await memoryService.getMemoryContext(orgId);
        const sys = { role: 'system' as const, content: CFO_SYSTEM_PROMPT + (memoryContext ? `\n\n${memoryContext}` : '') };
        const compacted = await compactMessages(messages);
        const ctxMsgs: any[] = [sys, ...compacted];
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
              toolCache.set(orgId, tc.function.name, tc.function.arguments, out);
              send('tool_done', { name: tc.function.name });
              ctxMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });
            }
            continue;
          }

          // Final answer round — stream tokens.
          if (decision.content) {
            // We already have the final answer from this round (no tool calls). Stream it as one chunk for fidelity
            // plus we restart a streaming pass to feel live.
            // IMPORTANT: Anthropic (via the Emergent gateway) rejects requests with 400 if the message history
            // contains prior tool_calls/tool messages but no `tools` param is supplied on THIS call. Since every
            // CFO answer almost always follows a tool round, `tools` must be passed here too. tool_choice:'none'
            // forces a direct text answer (we've already decided no more tools are needed).
            const streamMsgs = [...ctxMsgs];
            send('answer_start', {});
            try {
              for await (const chunk of llm.stream({ messages: streamMsgs, tools: toolSpecs(), tool_choice: 'none', temperature: 0.2, max_tokens: 1500 })) {
                if (chunk.delta) { finalAnswer += chunk.delta; send('token', { delta: chunk.delta }); }
              }
              if (!finalAnswer) { finalAnswer = decision.content; send('token', { delta: decision.content }); }
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

        trackServer('cfo_response_completed', { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo });

        // Record real usage for billing/gating purposes.
        usageService.record(orgId, 'ai_messages').catch(() => {});

        // Best-effort, non-blocking memory extraction from this turn's user message — never invents
        // facts, only captures what the user explicitly stated (business/goal/decision/preference).
        const lastUserText = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
        memoryService.extractMemoriesFromTurn(orgId, 'cfo', lastUserText, convo!.id).catch(() => {});
      } catch (e: any) {
        const isUnavailable = e instanceof LLMUnavailableError;
        trackServer('cfo_response_failed', { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo, meta: { reason: isUnavailable ? 'ai_unavailable' : 'internal' } });
        send('error', {
          code: isUnavailable ? 'ai_unavailable' : 'internal',
          message: isUnavailable
            ? "We're temporarily unable to reach the AI. Your financial analysis is complete. Please try again in a few moments."
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
