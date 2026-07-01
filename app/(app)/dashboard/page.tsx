'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowUpRight, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Sparkles, MessageSquare, Receipt, Wallet, Activity } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { OnboardingBanner } from '@/components/app/OnboardingBanner';

const fetcher = (u: string) => fetch(u).then(r => r.json());

function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function $$$(n: number) { return `$${fmt(Math.round(n))}`; }

const CHART_COLORS = ['hsl(var(--foreground))', 'hsl(var(--foreground)/0.7)', 'hsl(var(--foreground)/0.5)', 'hsl(var(--foreground)/0.35)', 'hsl(var(--foreground)/0.22)', 'hsl(var(--foreground)/0.15)', 'hsl(var(--foreground)/0.1)'];

export default function ExecutiveOverview() {
  const { data, isLoading, error, mutate } = useSWR('/api/cfo/briefing', fetcher, { revalidateOnFocus: false });

  if (isLoading || !data) return <LoadingState />;

  // Graceful "no organization yet" onboarding state — the CFO needs an org before it can brief you.
  if (data?.error || !data?.kpis) {
    const noOrg = typeof data?.error === 'string' && /organization/i.test(data.error);
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-12">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">{noOrg ? 'Create your workspace to meet the CFO' : 'The CFO briefing is unavailable'}</h2>
              <p className="text-sm text-muted-foreground">{noOrg
                ? "Give your company a name, and NexusAI CFO will brief you on cash, revenue, expenses and risks in under 30 seconds."
                : (data?.error || 'We hit a snag preparing your briefing. Try again in a moment.')}</p>
            </div>
            <Link href={noOrg ? '/organization' : '/dashboard'}>
              <Button size="lg" className="rounded-full">
                {noOrg ? 'Create workspace' : 'Try again'} <ArrowUpRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { briefing, kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors } = data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Onboarding banner */}
      <OnboardingBanner orgsCount={1} hasData={(kpis.revenue30d + kpis.expenses30d) > 0} />

      {/* Executive briefing OR premium AI-unavailable card */}
      {data.aiAvailable === false ? (
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">We're temporarily unable to reach the AI.</p>
                <p className="mt-0.5 text-sm text-muted-foreground">Your financial analysis is complete and up to date. Please try again in a few moments.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => mutate()}>Retry</Button>
              <a href="#kpis"><Button size="sm" variant="outline">View financial metrics</Button></a>
              <Link href="/cfo/reports"><Button size="sm" variant="ghost">Generate report without AI</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card className="relative overflow-hidden border-foreground/15 bg-gradient-to-br from-foreground to-foreground/80 text-background">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-background/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-background/5 blur-3xl" />
        <CardHeader className="relative">
          <div className="flex items-center gap-2">
            <Badge className="border-background/30 bg-background/15 text-background hover:bg-background/20"><Sparkles className="mr-1 h-3 w-3" /> NexusAI CFO</Badge>
            <span className="text-xs text-background/60">Briefing for {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-background/90">
            <Markdown text={briefing} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/cfo/chat"><Button size="sm" variant="secondary" className="bg-background text-foreground hover:bg-background/90"><MessageSquare className="mr-1.5 h-4 w-4" /> Ask follow-up</Button></Link>
            <Link href="/cfo/reports"><Button size="sm" variant="ghost" className="text-background hover:bg-background/10">Generate full report</Button></Link>
          </div>
        </CardContent>
      </Card>
      )}

      {/* KPIs */}
      <div id="kpis" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Revenue (30d)" value={$$$( kpis.revenue30d )} delta={kpis.revDeltaPct} positiveGood />
        <Kpi icon={TrendingDown} label="Expenses (30d)" value={$$$( kpis.expenses30d )} delta={kpis.expDeltaPct} positiveGood={false} />
        <Kpi icon={Activity} label="Net profit (30d)" value={$$$( kpis.profit30d )} sub={kpis.revenue30d > 0 ? `${((kpis.profit30d / kpis.revenue30d) * 100).toFixed(1)}% margin` : ''} />
        <Kpi icon={ShieldCheck} label="Cash runway" value={kpis.runwayDays == null ? '∞' : `${kpis.runwayDays}d`} sub={kpis.runwayDays == null ? 'Cash-flow positive' : `Burn $${fmt(kpis.burnRate)}/mo`} />
      </div>

      {/* Health + Forecast */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Business Health</CardTitle><CardDescription>{health.band.replace('_', ' ')}</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2"><div className="text-5xl font-semibold tracking-tight tabular-nums">{health.score}</div><div className="text-sm text-muted-foreground">/ 100</div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${health.score}%` }} />
            </div>
            <ul className="mt-5 space-y-2">
              {health.factors.map((f: any) => (
                <li key={f.label} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums ${f.impact >= 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'}`}>{f.impact >= 0 ? '+' : ''}{f.impact}</span>
                  <div className="flex-1"><p className="font-medium text-foreground">{f.label}</p><p className="text-muted-foreground">{f.note}</p></div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle className="text-base">Cash flow forecast</CardTitle><CardDescription>Next 90 days based on 30d trailing trend</CardDescription></div>
              <Badge variant="secondary">{forecast.scheduledEvents} events scheduled</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(s) => s.slice(5)} interval={Math.floor(forecast.series.length / 6)} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => `$${fmt(v)}`} />
                <Area type="monotone" dataKey="cash" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#cash)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations + Anomalies */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">AI recommendations</CardTitle><CardDescription>Prioritized actions for this week</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {recs.map((r: any) => (
              <div key={r.id} className="rounded-xl border p-4 transition hover:border-foreground/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1"><p className="font-medium">{r.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{r.reason}</p></div>
                  <Badge variant={r.impact === 'high' ? 'default' : 'secondary'} className="shrink-0 capitalize">{r.impact}</Badge>
                </div>
                <p className="mt-2.5 text-xs font-medium text-foreground/80">→ {r.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Overdue invoices</CardTitle><CardDescription>{overdue.length} requiring attention</CardDescription></CardHeader>
            <CardContent>
              {overdue.length === 0 ? <p className="text-sm text-muted-foreground">All invoices current. 🎉</p> : (
                <ul className="divide-y">
                  {overdue.slice(0, 4).map((i: any) => (
                    <li key={i.id} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{i.vendor}</p><p className="text-xs text-muted-foreground">{i.invoiceNumber} · due {i.dueDate}</p></div>
                      <span className="font-mono text-sm tabular-nums">{$$$( i.amount )}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Anomalies detected</CardTitle><CardDescription>Unusual recent transactions</CardDescription></CardHeader>
            <CardContent>
              {anomalies.length === 0 ? <p className="text-sm text-muted-foreground">No anomalies detected.</p> : (
                <ul className="space-y-2">
                  {anomalies.map((a: any) => (
                    <li key={a.transactionId} className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.vendor} — {$$$( a.amount )}</p><p className="text-xs text-muted-foreground">{a.reason}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Expense breakdown + Top vendors */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Expense breakdown</CardTitle><CardDescription>Last 30 days by category</CardDescription></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown.slice(0, 7)} dataKey="amount" nameKey="category" innerRadius={56} outerRadius={92} paddingAngle={2} stroke="hsl(var(--background))" strokeWidth={2}>
                  {breakdown.slice(0, 7).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => `$${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top vendors</CardTitle><CardDescription>By total spend (90d)</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {vendors.slice(0, 7).map((v: any, i: number) => {
                const max = vendors[0]?.amount || 1;
                return (
                  <li key={v.vendor} className="">
                    <div className="flex items-center justify-between text-sm"><span className="font-medium">{v.vendor}</span><span className="font-mono tabular-nums">{$$$( v.amount )}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/80" style={{ width: `${(v.amount / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, delta, sub, positiveGood = true }: any) {
  const showDelta = typeof delta === 'number';
  const good = positiveGood ? delta >= 0 : delta <= 0;
  return (
    <Card className="transition-all hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
          {showDelta && <span className={`text-[11px] font-medium ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub || (showDelta ? 'vs prior 30 days' : ' ')}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Card className="h-48"><CardContent className="space-y-3 p-6"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-1/3" /></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-4">{[0,1,2,3].map(i => <Card key={i}><CardContent className="space-y-3 p-6"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-24" /></CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Card className="h-80 lg:col-span-1" /><Card className="h-80 lg:col-span-2" /></div>
    </div>
  );
}

// Minimal markdown renderer for the briefing (bold + bullets + headings)
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every(l => /^\s*\*\s/.test(l) || /^\s*\d+\.\s/.test(l))) {
          const isNum = /^\s*\d+\.\s/.test(lines[0]);
          return isNum ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">{lines.map((l, j) => <li key={j}><InlineMd text={l.replace(/^\s*\d+\.\s/, '')} /></li>)}</ol>
          ) : (
            <ul key={i} className="space-y-1">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="text-background/40">•</span><span className="flex-1"><InlineMd text={l.replace(/^\s*\*\s/, '')} /></span></li>)}</ul>
          );
        }
        return <p key={i}><InlineMd text={b} /></p>;
      })}
    </div>
  );
}
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold text-background">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}
