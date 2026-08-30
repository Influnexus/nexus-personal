'use client';
// Sprint P5 — Ask Nexus Personal. Conversational AI over deterministic financial tools.
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, RotateCcw, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { track } from '@/lib/analytics/client';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolsUsed?: string[];
  isStreaming?: boolean;
}

const STARTERS = [
  'How am I doing financially?',
  'Can I afford a ₹2 lakh laptop?',
  'What will my cash look like in 90 days?',
  'Where am I spending the most?',
  'What should I pay attention to?',
  'How much resilience do I have?',
];

export default function PersonalChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  let idCounter = useRef(0);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
  };

  useEffect(() => { scrollToBottom(); }, [messages, toolStatus]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setError(null);

    const userMsg: Message = { id: `u-${idCounter.current++}`, role: 'user', content: text.trim() };
    const assistantMsg: Message = { id: `a-${idCounter.current++}`, role: 'assistant', content: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);
    setToolStatus(null);

    track('personal_chat_question');

    try {
      // Build messages array for API (only user/assistant messages)
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/personal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Please sign in again.' : 'Failed to get response.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      const toolsUsed: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event: ')) {
            const eventType = trimmed.slice(7);
            continue;
          }
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);

          try {
            const data = JSON.parse(dataStr);
            // Parse based on what we receive
            if (data.delta !== undefined) {
              // Token
              content += data.delta;
              setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content, isStreaming: true } : m));
            } else if (data.label) {
              // Tool start
              setToolStatus(data.label);
              if (data.name) toolsUsed.push(data.name);
            } else if (data.code) {
              // Error
              setError(data.message || 'Something went wrong.');
              setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
            }
          } catch {
            // Try to handle event: / data: pair format
          }
        }
      }

      // Finalize
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, content: content || 'I couldn\'t generate a response. Please try again.', isStreaming: false, toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined } : m
      ));
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
    } finally {
      setLoading(false);
      setToolStatus(null);
      inputRef.current?.focus();
    }
  }, [messages, loading]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setError(null);
    setToolStatus(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" data-testid="personal-chat-page">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-sm font-semibold">Ask Nexus</h1>
          <p className="text-[11px] text-muted-foreground">Understand your money. Explore decisions. See what happens next.</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> New chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/5 mb-4">
              <Sparkles className="h-5 w-5 text-foreground/60" />
            </div>
            <h2 className="text-lg font-semibold">Ask Nexus</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Ask about your financial health, spending, resilience, forecast, or explore &ldquo;what if&rdquo; scenarios.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  data-testid="starter-prompt"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-foreground text-background'
                : 'bg-card border border-border'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{msg.content || (msg.isStreaming ? '' : 'No response.')}</ReactMarkdown>
                  {msg.isStreaming && !msg.content && toolStatus && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{toolStatus}</span>
                    </div>
                  )}
                  {msg.isStreaming && msg.content && (
                    <span className="inline-block w-1.5 h-4 bg-foreground/40 animate-pulse ml-0.5" />
                  )}
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && !messages.some(m => m.isStreaming && m.content) && toolStatus && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-card border border-border px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{toolStatus}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-500 text-center">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/60 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask about your finances..."
            className="flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={loading}
            data-testid="chat-input"
          />
          <Button type="submit" size="sm" disabled={loading || !input.trim()} className="shrink-0 self-end" data-testid="chat-send">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Financial data is calculated deterministically by Nexus. AI explains results — it does not calculate them. Not regulated financial advice.
        </p>
      </div>
    </div>
  );
}
