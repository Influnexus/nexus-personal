// Lightweight first-run onboarding banner: shows steps until completed in localStorage.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Check, ChevronRight, Sparkles, X } from 'lucide-react';

export function OnboardingBanner({ orgsCount, hasData }: { orgsCount: number; hasData: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(localStorage.getItem('nexus_onb_dismissed') === '1'); }, []);
  if (dismissed) return null;
  const steps = [
    { id: 'org', label: 'Create your workspace', done: orgsCount > 0, href: '/organization' },
    { id: 'data', label: 'Add financial data (CSV or auto-seed)', done: hasData, href: '/cfo/transactions' },
    { id: 'brief', label: 'Read your first AI briefing', done: hasData, href: '/dashboard' },
    { id: 'ask', label: 'Ask the CFO a question', done: false, href: '/cfo/chat' },
  ];
  const completed = steps.filter(s => s.done).length;
  if (completed === steps.length) return null;
  return (
    <Card className="relative overflow-hidden border-foreground/15">
      <CardContent className="p-5">
        <button onClick={() => { localStorage.setItem('nexus_onb_dismissed', '1'); setDismissed(true); }} className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <p className="text-sm font-semibold">Get to your first executive briefing in under 5 minutes</p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
          <span className="text-xs tabular-nums text-muted-foreground">{completed}/{steps.length}</span>
        </div>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {steps.map(s => (
            <li key={s.id}>
              <Link href={s.href} className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm transition hover:border-foreground/30">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${s.done ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'border bg-muted text-muted-foreground'}`}>{s.done ? <Check className="h-3 w-3" /> : <span className="text-[10px]">{steps.indexOf(s) + 1}</span>}</span>
                <span className={`flex-1 ${s.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>{s.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
