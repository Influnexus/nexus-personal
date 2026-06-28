// LLM Provider abstraction — OpenAI-compatible. Routes through the Emergent universal gateway today;
// can be swapped to any OpenAI-compatible provider (OpenAI, Anthropic Bedrock, Gemini OpenAI-compat) by
// changing baseURL/apiKey/model.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatTextPart { type: 'text'; text: string }
export interface ChatImagePart { type: 'image_url'; image_url: { url: string } }
export type ChatContent = string | (ChatTextPart | ChatImagePart)[];

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content?: ChatContent | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface CompleteOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  tools?: ToolSpec[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

export interface CompleteResult {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason: string;
  usage?: any;
}

export interface LLMProvider {
  name: string;
  defaultModel: string;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  stream(opts: CompleteOptions): AsyncGenerator<{ delta?: string; tool_calls?: ToolCall[]; finish_reason?: string }>;
}

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

class EmergentProvider implements LLMProvider {
  name = 'emergent';
  defaultModel = DEFAULT_MODEL;

  private get key() {
    const k = process.env.EMERGENT_LLM_KEY;
    if (!k) throw new Error('EMERGENT_LLM_KEY is not configured');
    return k;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const body: any = {
      model: opts.model || this.defaultModel,
      messages: opts.messages,
      max_tokens: opts.max_tokens ?? 2048,
    };
    if (opts.temperature != null) body.temperature = opts.temperature;
    if (opts.response_format) body.response_format = opts.response_format;
    if (opts.tools) body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;

    const r = await fetch(EMERGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`LLM ${r.status}: ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      tool_calls: choice?.message?.tool_calls,
      finish_reason: choice?.finish_reason || 'stop',
      usage: data.usage,
    };
  }

  async *stream(opts: CompleteOptions) {
    const body: any = {
      model: opts.model || this.defaultModel,
      messages: opts.messages,
      max_tokens: opts.max_tokens ?? 2048,
      stream: true,
    };
    if (opts.temperature != null) body.temperature = opts.temperature;
    if (opts.tools) body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;

    const r = await fetch(EMERGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}`, Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '');
      throw new Error(`LLM stream ${r.status}: ${t.slice(0, 200)}`);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const ch = json.choices?.[0];
          const delta = ch?.delta?.content;
          const tcs = ch?.delta?.tool_calls;
          const fin = ch?.finish_reason;
          if (delta || tcs || fin) yield { delta, tool_calls: tcs, finish_reason: fin };
        } catch { /* ignore */ }
      }
    }
  }
}

export const llm: LLMProvider = new EmergentProvider();
