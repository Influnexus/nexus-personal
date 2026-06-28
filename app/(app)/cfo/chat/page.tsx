'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Wrench, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface UIMsg { role: 'user' | 'assistant'; content: string; toolCalls?: any[] }

const SUGGESTIONS = [
  'What is my cash runway right now?',
  'Which expenses grew the most this month?',
  'Which invoices are overdue and what do you recommend?',
  'Where can I reduce costs without hurting growth?',
  'Summarize this month’s financial performance.',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: convosData, mutate: mutateConvos } = useSWR('/api/cfo/chat', fetcher);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/cfo/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), conversationId: convId }),
      });
      const d = await res.json();
      if (!res.ok) { setMessages([...next, { role: 'assistant', content: `⚠️ ${d.error || 'AI error'}` }]); return; }
      setConvId(d.conversationId);
      setMessages([...next, { role: 'assistant', content: d.answer, toolCalls: d.toolCalls }]);
      mutateConvos();
    } finally { setLoading(false); }
  }

  const convos = convosData?.conversations || [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="hidden w-72 shrink-0 border-r bg-muted/20 p-3 lg:flex lg:flex-col">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setMessages([]); setConvId(null); }}><MessageSquare className="h-4 w-4" /> New conversation</Button>
        <p className="px-2 pb-1 pt-5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
        <ScrollArea className="-mx-1 flex-1">
          <ul className="space-y-0.5 px-1">
            {convos.map((c: any) => (
              <li key={c.id}>
                <button onClick={async () => {
                  const r = await fetch(`/api/cfo/conversations/${c.id}`); const d = await r.json();
                  if (d.conversation) {
                    setConvId(c.id);
                    setMessages(d.conversation.messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content, toolCalls: m.tool_calls })));
                  }
                }} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-accent', convId === c.id && 'bg-accent')}>
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{c.title}</span>
                </button>
              </li>
            ))}
            {convos.length === 0 && <li className="px-2.5 py-2 text-xs text-muted-foreground">No conversations yet.</li>}
          </ul>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
          <div><h1 className="text-base font-semibold">Ask the CFO</h1><p className="text-xs text-muted-foreground">Powered by Claude Sonnet 4.5 with financial tools</p></div>
          <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> NexusAI CFO</Badge>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
            {messages.length === 0 && (
              <div className="py-10 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background"><Sparkles className="h-5 w-5" /></div>
                <h2 className="text-xl font-semibold tracking-tight">Your AI Chief Financial Officer.</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Ask anything about cash, expenses, revenue, invoices, vendors or strategy.</p>
                <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border bg-card p-3 text-left text-sm transition hover:border-foreground/30 hover:bg-accent">{s}</button>
                  ))}
                </div>
              </div>
            )}
            <ul className="space-y-6">
              {messages.map((m, i) => <MsgBubble key={i} msg={m} />)}
              {loading && (
                <li className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Sparkles className="h-4 w-4" /></div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing your financials…</div>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t bg-background p-3 md:p-4">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cash, runway, expenses, invoices…"
              rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="min-h-[44px] resize-none rounded-2xl border-border/80"
            />
            <Button type="submit" disabled={loading || !input.trim()} className="h-11 rounded-full px-4"><Send className="h-4 w-4" /></Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">CFO uses your transactions, invoices, and vendor data. Verify critical numbers before acting.</p>
        </div>
      </div>
    </div>
  );
}

function MsgBubble({ msg }: { msg: UIMsg }) {
  if (msg.role === 'user') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-foreground px-4 py-2.5 text-sm text-background">{msg.content}</div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Sparkles className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-[14.5px] leading-relaxed">
          <Markdown text={msg.content} />
        </div>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.toolCalls.map((tc: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"><Wrench className="h-2.5 w-2.5" />{tc.name}</span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (<div className="space-y-2">{blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines.every(l => /^\s*\*\s|^\s*-\s|^\s*\d+\.\s/.test(l))) {
      const isNum = /^\s*\d+\.\s/.test(lines[0]);
      return isNum ?
        <ol key={i} className="list-decimal space-y-1 pl-5">{lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*\d+\.\s/, '')} /></li>)}</ol> :
        <ul key={i} className="space-y-1">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="text-muted-foreground">•</span><span className="flex-1"><Inline text={l.replace(/^\s*[\*\-]\s/, '')} /></span></li>)}</ul>;
    }
    if (/^#{1,3}\s/.test(b)) {
      const lvl = (b.match(/^#+/) || [''])[0].length;
      const txt = b.replace(/^#+\s/, '');
      return <p key={i} className={lvl <= 2 ? 'font-semibold text-base' : 'font-semibold'}>{txt}</p>;
    }
    return <p key={i}><Inline text={b} /></p>;
  })}</div>);
}
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i} className="rounded bg-muted px-1 py-0.5 text-[12.5px]">{p.slice(1, -1)}</code> : <span key={i}>{p}</span>)}</>;
}
