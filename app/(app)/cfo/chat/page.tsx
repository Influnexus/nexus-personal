'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Wrench, Loader2, MessageSquare, Check, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface ToolStep { name: string; label: string; status: 'running' | 'done' }
interface UIMsg { role: 'user' | 'assistant'; content: string; tools?: ToolStep[]; streaming?: boolean; aiUnavailable?: boolean; usageLimited?: boolean }

const SUGGESTIONS = [
  { q: 'What is my cash runway right now?', hint: 'Cash & liquidity' },
  { q: 'Which expenses grew the most this month?', hint: 'Cost analysis' },
  { q: 'Which invoices are overdue and what do you recommend?', hint: 'Accounts receivable' },
  { q: 'Where can I reduce costs without hurting growth?', hint: 'Efficiency' },
];

// Extract "Confidence: high|medium|low" trailing tag from CFO answers so we can render it as a badge.
function extractConfidence(text: string): { level: 'high' | 'medium' | 'low' | null; body: string } {
  const m = text.match(/(?:^|\n)_?\**\s*Confidence:?\s*\**\s*(high|medium|low)\b[^.\n]*\.?\s*_?\s*$/i);
  if (!m) return { level: null, body: text };
  const level = m[1].toLowerCase() as any;
  return { level, body: text.slice(0, m.index).trimEnd() };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: convosData, mutate: mutateConvos } = useSWR('/api/cfo/chat', fetcher);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);
  // ⌘/Ctrl+K → focus input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim(); if (!text || loading) return;
    const userMsg: UIMsg = { role: 'user', content: text };
    const placeholder: UIMsg = { role: 'assistant', content: '', tools: [], streaming: true };
    const next = [...messages, userMsg, placeholder];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/cfo/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })), conversationId: convId }),
      });
      if (!res.ok || !res.body) { update(prev => ({ ...prev, content: '⚠️ Unable to reach the assistant. Please try again.', streaming: false })); return; }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = '';
      let assistantText = ''; const tools: ToolStep[] = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n'); buf = events.pop() || '';
        for (const ev of events) {
          const eMatch = ev.match(/event: (\w+)\ndata: (.+)/s);
          if (!eMatch) continue;
          const type = eMatch[1]; let data: any = {}; try { data = JSON.parse(eMatch[2]); } catch { }
          if (type === 'meta') { if (data.conversationId) setConvId(data.conversationId); }
          else if (type === 'tool_start') { tools.push({ name: data.name, label: data.label, status: 'running' }); update(p => ({ ...p, tools: [...tools] })); }
          else if (type === 'tool_done') { const t = tools.find(x => x.name === data.name && x.status === 'running'); if (t) t.status = 'done'; update(p => ({ ...p, tools: [...tools] })); }
          else if (type === 'token') { assistantText += data.delta || ''; update(p => ({ ...p, content: assistantText })); }
          else if (type === 'done') { update(p => ({ ...p, streaming: false })); mutateConvos(); }
          else if (type === 'error') {
            const isAI = data.code === 'ai_unavailable';
            const isLimit = data.code === 'usage_limit';
            const banner = isAI ? "We're temporarily unable to reach the AI. Your financial analysis is complete. Please try again in a few moments." : (data.message || 'AI error');
            update(p => ({ ...p, content: banner, streaming: false, aiUnavailable: isAI, usageLimited: isLimit }));
          }
        }
      }
    } catch (e: any) { update(p => ({ ...p, content: '⚠️ ' + (e.message || 'Network error'), streaming: false })); }
    finally { setLoading(false); }
    function update(m: (prev: UIMsg) => UIMsg) { setMessages(prev => { const c = [...prev]; c[c.length - 1] = m(c[c.length - 1]); return c; }); }
  }

  const convos = convosData?.conversations || [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="hidden w-72 shrink-0 border-r bg-muted/20 p-3 lg:flex lg:flex-col">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setMessages([]); setConvId(null); inputRef.current?.focus(); }}><MessageSquare className="h-4 w-4" /> New conversation</Button>
        <p className="px-2 pb-1 pt-5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
        <ScrollArea className="-mx-1 flex-1">
          <ul className="space-y-0.5 px-1">
            {convos.map((c: any) => (
              <li key={c.id}>
                <button onClick={async () => {
                  const r = await fetch(`/api/cfo/conversations/${c.id}`); const d = await r.json();
                  if (d.conversation) { setConvId(c.id); setMessages(d.conversation.messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content }))); }
                }} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-accent', convId === c.id && 'bg-accent')}>
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{c.title}</span>
                </button>
              </li>
            ))}
            {convos.length === 0 && <li className="px-2.5 py-2 text-xs text-muted-foreground">No conversations yet.</li>}
          </ul>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-background/70 px-4 py-3 backdrop-blur-xl md:px-6">
          <div><h1 className="text-base font-semibold">Ask the CFO</h1><p className="text-xs text-muted-foreground">Streaming · Claude Sonnet 4.5 · grounded in your data</p></div>
          <div className="flex items-center gap-2">
            <kbd className="hidden md:inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">⌘ K</kbd>
            <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> NexusAI CFO</Badge>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
            {messages.length === 0 && (
              <div className="py-12 text-center">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-foreground to-foreground/70 text-background shadow-lg shadow-foreground/20">
                  <Sparkles className="h-6 w-6" />
                </motion.div>
                <h2 className="text-[22px] font-semibold tracking-tight">Your AI Chief Financial Officer.</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Ask anything about cash, expenses, revenue, invoices, vendors or strategy.</p>
                <div className="mx-auto mt-8 grid max-w-2xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s, i) => (
                    <motion.button key={s.q} onClick={() => send(s.q)}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.15, duration: 0.35 }}
                      className="group rounded-xl border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"><Zap className="h-3 w-3" /> {s.hint}</div>
                      <div className="mt-1 text-sm font-medium leading-snug">{s.q}</div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            <ul className="space-y-6">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-3'}>
                    {m.role === 'user' ? (
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-foreground px-4 py-2.5 text-sm text-background">{m.content}</div>
                    ) : (
                      <AssistantBubble msg={m} />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>
        <div className="border-t bg-background p-3 md:p-4">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea ref={inputRef as any} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about cash, runway, expenses, invoices… (⌘K to focus)" rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="min-h-[46px] resize-none rounded-2xl border-border/80 text-[14.5px]" />
            <Button type="submit" disabled={loading || !input.trim()} className="h-11 rounded-full px-4"><Send className="h-4 w-4" /></Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">CFO uses your transactions, invoices and vendor data. Verify critical numbers before acting.</p>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: UIMsg }) {
  const hasTools = msg.tools && msg.tools.length > 0;
  const { level, body } = extractConfidence(msg.content || '');
  const confidenceMeta = level === 'high' ? { color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15', icon: ShieldCheck, label: 'High confidence' }
    : level === 'medium' ? { color: 'text-amber-700 dark:text-amber-400 bg-amber-500/15', icon: ShieldCheck, label: 'Medium confidence' }
    : level === 'low' ? { color: 'text-rose-700 dark:text-rose-400 bg-rose-500/15', icon: AlertTriangle, label: 'Low confidence' } : null;

  return (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-foreground to-foreground/70 text-background shadow-sm"><Sparkles className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1 space-y-2">
        {hasTools && (
          <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-2.5">
            {msg.tools!.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[12.5px]">
                {t.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                <span className={t.status === 'running' ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40'}>{t.label}</span>
              </div>
            ))}
          </div>
        )}
        {(body || !msg.streaming) && (
          <div className={cn('rounded-2xl rounded-tl-sm border px-4 py-3 text-[14.5px] leading-relaxed', (msg.aiUnavailable || msg.usageLimited) ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'bg-card')}>
            <Markdown text={body || ''} />
            {msg.streaming && <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-foreground/70 align-middle" />}
            {msg.usageLimited && (
              <div className="mt-3"><Link href="/billing"><Button size="sm" className="rounded-full">View plans</Button></Link></div>
            )}
          </div>
        )}
        {msg.streaming && !body && !hasTools && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>}
        {(confidenceMeta || (msg.tools && msg.tools.some(t => t.status === 'done'))) && !msg.streaming && (
          <div className="flex flex-wrap items-center gap-1.5">
            {confidenceMeta && (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', confidenceMeta.color)}>
                <confidenceMeta.icon className="h-2.5 w-2.5" /> {confidenceMeta.label}
              </span>
            )}
            {msg.tools?.filter(t => t.status === 'done').map((tc, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"><Wrench className="h-2.5 w-2.5" />{tc.name}</span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0; let key = 0;
  const isNumLine = (l: string) => /^\s*\d+\.\s/.test(l);
  const isBulletLine = (l: string) => /^\s*[\*\-]\s/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (isNumLine(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (isNumLine(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s/, '')); i++; }
        else if (lines[i].trim() === '' && lines[i + 1] !== undefined && isNumLine(lines[i + 1])) { i++; }
        else break;
      }
      nodes.push(<ol key={key++} className="list-decimal space-y-1 pl-5">{items.map((it, j) => <li key={j}><Inline t={it} /></li>)}</ol>);
      continue;
    }
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (isBulletLine(lines[i])) { items.push(lines[i].replace(/^\s*[\*\-]\s/, '')); i++; }
        else if (lines[i].trim() === '' && lines[i + 1] !== undefined && isBulletLine(lines[i + 1])) { i++; }
        else break;
      }
      nodes.push(<ul key={key++} className="space-y-1">{items.map((it, j) => <li key={j} className="flex gap-2"><span className="text-muted-foreground">•</span><span className="flex-1"><Inline t={it} /></span></li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isNumLine(lines[i]) && !isBulletLine(lines[i])) { para.push(lines[i]); i++; }
    nodes.push(<p key={key++}><Inline t={para.join(' ')} /></p>);
  }
  return <div className="space-y-2">{nodes}</div>;
}
function Inline({ t }: { t: string }) {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i} className="rounded bg-muted px-1 py-0.5 text-[12.5px]">{p.slice(1, -1)}</code> : <span key={i}>{p}</span>)}</>;
}
