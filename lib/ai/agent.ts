// Agent loop: takes user messages + tools + context. Iterates tool calls until model returns final answer.

import { llm, ChatMessage, ToolCall } from './provider';
import { toolSpecs, runTool, ToolContext } from './tools';
import { CFO_SYSTEM_PROMPT } from './prompts';

export interface AgentTrace {
  toolCalls: { name: string; args: string; result: any }[];
  finalAnswer: string;
}

export async function runCfoAgent(
  userMessages: ChatMessage[],
  ctx: ToolContext,
  opts?: { systemPrompt?: string; maxSteps?: number; temperature?: number }
): Promise<AgentTrace> {
  const system: ChatMessage = { role: 'system', content: opts?.systemPrompt || CFO_SYSTEM_PROMPT };
  const messages: ChatMessage[] = [system, ...userMessages];
  const trace: AgentTrace = { toolCalls: [], finalAnswer: '' };
  const maxSteps = opts?.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await llm.complete({
      messages,
      tools: toolSpecs(),
      tool_choice: 'auto',
      temperature: opts?.temperature ?? 0.2,
      max_tokens: 1500,
    });

    if (res.tool_calls && res.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: res.tool_calls });
      for (const tc of res.tool_calls) {
        const out = await runTool(tc.function.name, tc.function.arguments, ctx);
        trace.toolCalls.push({ name: tc.function.name, args: tc.function.arguments, result: out });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });
      }
      continue;
    }

    trace.finalAnswer = res.content || '';
    return trace;
  }
  trace.finalAnswer = trace.finalAnswer || 'I could not complete the analysis. Please rephrase or try again.';
  return trace;
}
