// LLM provider with production hardening:
//   • Retry with exponential backoff (500ms → 1s → 2s)
//   • Circuit breaker per model (opens for 60s after repeated failures)
//   • Fallback chain across models (Claude → GPT-4o → Gemini) via the same Emergent gateway
//   • Metrics buffer (last 100 calls) exposed to /api/ai/health
//   • Structured logging — raw provider errors are never re-thrown to the app layer

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ChatTextPart { type: 'text'; text: string }
export interface ChatImagePart { type: 'image_url'; image_url: { url: string } }
export type ChatContent = string | (ChatTextPart | ChatImagePart)[];
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatMessage { role: ChatRole; content?: ChatContent | null; name?: string; tool_call_id?: string; tool_calls?: ToolCall[] }
export interface ToolSpec { type: 'function'; function: { name: string; description: string; parameters: Record<string, any> } }
export interface CompleteOptions {
  messages: ChatMessage[]; model?: string; temperature?: number; max_tokens?: number;
  response_format?: { type: 'json_object' }; tools?: ToolSpec[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }; stream?: boolean;
}
export interface CompleteResult { content: string | null; tool_calls?: ToolCall[]; finish_reason: string; usage?: any; providerUsed?: string; latencyMs?: number }

export class LLMUpstreamError extends Error {
  constructor(public status: number, public body: string, public model: string, public latencyMs: number) {
    super(`LLM upstream ${status} on ${model}`);
  }
}
export class LLMUnavailableError extends Error {
  constructor(message = 'AI provider is temporarily unavailable') { super(message); }
}

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions';
const PRIMARY = 'claude-sonnet-4-5-20250929';
// NOTE: verified against this gateway's /v1/models list — 'gemini-2.5-pro' (bare) is an INVALID
// model id here, it must be prefixed 'gemini/gemini-2.5-pro'. Without this the fallback silently 400s.
const FALLBACKS = ['gpt-5', 'gemini/gemini-2.5-pro'];
const MODELS = [PRIMARY, ...FALLBACKS];
const RETRY_DELAYS_MS = [500, 1000, 2000];

// ---------- Circuit breaker ----------
interface Breaker { failures: number; openedUntil: number }
const BREAKERS: Record<string, Breaker> = {};
const BREAKER_THRESHOLD = 3;   // consecutive failures
const BREAKER_OPEN_MS = 60_000; // 60s
function breakerAllows(model: string) {
  const b = BREAKERS[model]; if (!b) return true;
  if (b.openedUntil > Date.now()) return false;
  if (b.openedUntil !== 0 && b.openedUntil <= Date.now()) { b.failures = 0; b.openedUntil = 0; }
  return true;
}
function breakerRecord(model: string, success: boolean) {
  const b = BREAKERS[model] || (BREAKERS[model] = { failures: 0, openedUntil: 0 });
  if (success) { b.failures = 0; b.openedUntil = 0; return; }
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD) b.openedUntil = Date.now() + BREAKER_OPEN_MS;
}

// ---------- Metrics ----------
export interface CallMetric {
  ts: number; model: string; latencyMs: number; status: number | 'error' | 'ok'; success: boolean;
  promptTokens?: number; completionTokens?: number; errorReason?: string; provider: string;
}
const METRICS: CallMetric[] = [];
const METRICS_MAX = 100;
function pushMetric(m: CallMetric) { METRICS.push(m); if (METRICS.length > METRICS_MAX) METRICS.shift(); }

export function getAiHealth() {
  const now = Date.now();
  const last5m = METRICS.filter(m => now - m.ts < 5 * 60_000);
  const succ = last5m.filter(m => m.success);
  const lastSuccess = [...METRICS].reverse().find(m => m.success);
  const perModel = MODELS.map(model => {
    const rows = last5m.filter(m => m.model === model);
    const okRows = rows.filter(m => m.success);
    const avg = okRows.length ? Math.round(okRows.reduce((s, m) => s + m.latencyMs, 0) / okRows.length) : null;
    const failureRate = rows.length ? +(1 - okRows.length / rows.length).toFixed(3) : 0;
    const breaker = BREAKERS[model];
    return {
      model,
      requests: rows.length,
      averageLatencyMs: avg,
      failureRate,
      available: breakerAllows(model),
      circuitOpenUntil: breaker && breaker.openedUntil > now ? new Date(breaker.openedUntil).toISOString() : null,
    };
  });
  return {
    status: perModel.some(p => p.available) ? 'ok' : 'degraded',
    providerAvailable: perModel.some(p => p.available),
    primaryModel: PRIMARY,
    fallbackModels: FALLBACKS,
    windowMinutes: 5,
    totalRequests: last5m.length,
    successRate: last5m.length ? +(succ.length / last5m.length).toFixed(3) : 1,
    averageLatencyMs: succ.length ? Math.round(succ.reduce((s, m) => s + m.latencyMs, 0) / succ.length) : null,
    lastSuccessAt: lastSuccess ? new Date(lastSuccess.ts).toISOString() : null,
    lastError: [...METRICS].reverse().find(m => !m.success)?.errorReason || null,
    perModel,
  };
}

// ---------- Core request ----------
function buildBody(opts: CompleteOptions, model: string) {
  const body: any = { model, messages: opts.messages, max_tokens: opts.max_tokens ?? 2048 };
  // NOTE: verified against this gateway — GPT-5 models reject any temperature other than 1
  // ("litellm.UnsupportedParamsError: gpt-5 models ... don't support temperature=0"). Omitting it
  // lets the model use its default (1) instead of 400ing on every fallback call.
  const supportsCustomTemperature = !/^gpt-5/.test(model);
  if (opts.temperature != null && supportsCustomTemperature) body.temperature = opts.temperature;
  if (opts.response_format) body.response_format = opts.response_format;
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  if (opts.stream) body.stream = true;
  return body;
}

async function callOnce(opts: CompleteOptions, model: string, timeoutMs = 45_000): Promise<CompleteResult> {
  const key = process.env.EMERGENT_LLM_KEY;
  if (!key) throw new LLMUnavailableError('EMERGENT_LLM_KEY is not configured');
  const started = Date.now();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(EMERGENT_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildBody(opts, model)),
    });
    const latency = Date.now() - started;
    if (!r.ok) {
      const txt = (await r.text().catch(() => '')).slice(0, 400);
      throw new LLMUpstreamError(r.status, txt, model, latency);
    }
    const data = await r.json();
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      tool_calls: choice?.message?.tool_calls,
      finish_reason: choice?.finish_reason || 'stop',
      usage: data.usage,
      providerUsed: model,
      latencyMs: latency,
    };
  } finally { clearTimeout(to); }
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// ---------- Public API ----------
async function completeWithModel(opts: CompleteOptions, model: string): Promise<CompleteResult | LLMUpstreamError | LLMUnavailableError> {
  if (!breakerAllows(model)) return new LLMUnavailableError(`Circuit open for ${model}`);
  let attempt = 0;
  let lastErr: any = null;
  const started = Date.now();
  while (attempt <= RETRY_DELAYS_MS.length) {
    try {
      const res = await callOnce(opts, model);
      breakerRecord(model, true);
      pushMetric({
        ts: Date.now(), model, latencyMs: res.latencyMs || (Date.now() - started), status: 'ok', success: true,
        promptTokens: res.usage?.prompt_tokens, completionTokens: res.usage?.completion_tokens, provider: 'emergent',
      });
      return res;
    } catch (e: any) {
      lastErr = e;
      const status = e instanceof LLMUpstreamError ? e.status : 'error';
      const isRetriable = status === 'error' || (typeof status === 'number' && (status === 408 || status === 429 || status >= 500));
      const isLast = attempt === RETRY_DELAYS_MS.length;
      console.warn(`[LLM] ${model} attempt ${attempt + 1} failed status=${status} reason=${e.message?.slice(0, 200)}`);
      pushMetric({
        ts: Date.now(), model, latencyMs: e.latencyMs ?? (Date.now() - started), status, success: false,
        errorReason: e.message?.slice(0, 300), provider: 'emergent',
      });
      if (!isRetriable || isLast) { breakerRecord(model, false); return e; }
      await sleep(RETRY_DELAYS_MS[attempt]);
      attempt += 1;
    }
  }
  breakerRecord(model, false);
  return lastErr;
}

export interface LLMOrchestrator {
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  stream(opts: CompleteOptions): AsyncGenerator<{ delta?: string; tool_calls?: ToolCall[]; finish_reason?: string }>;
}

class EmergentOrchestrator implements LLMOrchestrator {
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const chain = opts.model ? [opts.model] : MODELS;
    let lastFailure: any = null;
    for (const model of chain) {
      const res = await completeWithModel(opts, model);
      if (res instanceof LLMUpstreamError || res instanceof LLMUnavailableError) { lastFailure = res; continue; }
      return res;
    }
    // All fallbacks failed — surface a friendly generic error; do NOT include raw upstream text.
    const reason = lastFailure?.message?.slice(0, 200) || 'AI provider unavailable';
    console.error(`[LLM] all providers failed — lastReason=${reason}`);
    throw new LLMUnavailableError();
  }

  async *stream(opts: CompleteOptions) {
    // Streaming now falls back across the full model chain (Claude → GPT-5 → Gemini), same as complete().
    // We only switch models BEFORE any content has been streamed to the client — once a chunk has been sent,
    // we can't safely restart with a different model without producing garbled/duplicated output.
    const chain = opts.model ? [opts.model] : MODELS;
    let lastFailure: any = null;
    for (const model of chain) {
      if (!breakerAllows(model)) { lastFailure = new LLMUnavailableError(`Circuit open for ${model}`); continue; }
      let attempt = 0;
      let startedStreamingContent = false;
      while (attempt <= RETRY_DELAYS_MS.length) {
        const started = Date.now();
        try {
          const key = process.env.EMERGENT_LLM_KEY;
          if (!key) throw new LLMUnavailableError();
          const r = await fetch(EMERGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Accept: 'text/event-stream' },
            body: JSON.stringify(buildBody({ ...opts, stream: true }, model)),
          });
          if (!r.ok || !r.body) {
            const txt = (await r.text().catch(() => '')).slice(0, 300);
            throw new LLMUpstreamError(r.status, txt, model, Date.now() - started);
          }
          const reader = r.body.getReader(); const decoder = new TextDecoder(); let buf = '';
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop() || '';
            for (const line of lines) {
              const t = line.trim(); if (!t.startsWith('data:')) continue;
              const p = t.slice(5).trim(); if (p === '[DONE]') { breakerRecord(model, true); pushMetric({ ts: Date.now(), model, latencyMs: Date.now() - started, status: 'ok', success: true, provider: 'emergent' }); return; }
              try {
                const json = JSON.parse(p);
                const ch = json.choices?.[0]; const delta = ch?.delta?.content; const tcs = ch?.delta?.tool_calls; const fin = ch?.finish_reason;
                if (delta) startedStreamingContent = true;
                if (delta || tcs || fin) yield { delta, tool_calls: tcs, finish_reason: fin };
              } catch { /* ignore malformed */ }
            }
          }
          breakerRecord(model, true);
          pushMetric({ ts: Date.now(), model, latencyMs: Date.now() - started, status: 'ok', success: true, provider: 'emergent' });
          return;
        } catch (e: any) {
          const status = e instanceof LLMUpstreamError ? e.status : 'error';
          const retriable = status === 'error' || (typeof status === 'number' && (status === 408 || status === 429 || status >= 500));
          console.warn(`[LLM stream] ${model} attempt ${attempt + 1} failed status=${status} reason=${(e.message || '').slice(0, 200)}`);
          pushMetric({ ts: Date.now(), model, latencyMs: e.latencyMs ?? (Date.now() - started), status, success: false, errorReason: e.message?.slice(0, 300), provider: 'emergent' });
          lastFailure = e;
          if (startedStreamingContent) { breakerRecord(model, false); throw new LLMUnavailableError(); }
          if (!retriable || attempt === RETRY_DELAYS_MS.length) { breakerRecord(model, false); break; }
          await sleep(RETRY_DELAYS_MS[attempt]);
          attempt += 1;
        }
      }
      // exhausted retries for this model without ever streaming content — try next model in chain
    }
    console.error(`[LLM stream] all providers failed — lastReason=${lastFailure?.message?.slice(0, 200) || 'unknown'}`);
    throw new LLMUnavailableError();
  }
}

export const llm: LLMOrchestrator = new EmergentOrchestrator();
