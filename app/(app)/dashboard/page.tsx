'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowUpRight, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Sparkles, MessageSquare, Wallet, Activity, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { OnboardingBanner } from '@/components/app/OnboardingBanner';
import { CountUp } from '@/components/app/CountUp';

const fetcher = (u: string) => fetch(u).then(r => r.json());

function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function $$$(n: number) { return `$${fmt(Math.round(n))}`; }

const CHART_COLORS = ['hsl(var(--foreground))', 'hsl(var(--foreground)/0.7)', 'hsl(var(--foreground)/0.5)', 'hsl(var(--foreground)/0.35)', 'hsl(var(--foreground)/0.22)', 'hsl(var(--foreground)/0.15)', 'hsl(var(--foreground)/0.1)'];

const stagger = { animate: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } };

export default function ExecutiveOverview() {
  const { data, isLoading, mutate } = useSWR('/api/cfo/briefing', fetcher, { revalidateOnFocus: false });
  if (isLoading || !data) return <LoadingState />;

  if (data?.error || !data?.kpis) {
    const noOrg = typeof data?.error === 'string' && /organization/i.test(data.error);
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-12">
        <motion.div {...fadeUp}>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-foreground to-foreground/70 text-background shadow-lg shadow-foreground/20"><Sparkles className="h-6 w-6" /></div>
              <div className="max-w-md space-y-1.5">
                <h2 className="text-2xl font-semibold tracking-tight">{noOrg ? 'Create your workspace to meet the CFO' : 'The CFO briefing is unavailable'}</h2>
                <p className="text-sm text-muted-foreground">{noOrg ? 'Give your company a name and NexusAI CFO will brief you on cash, revenue, expenses and risks in under 30 seconds.' : (data?.error || 'We hit a snag preparing your briefing. Try again in a moment.')}</p>
              </div>
              <Link href={noOrg ? '/organization' : '/dashboard'}>
                <Button size="lg" className="rounded-full">{noOrg ? 'Create workspace' : 'Try again'} <ArrowRight className="ml-1 h-4 w-4" /></Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const { briefing, aiAvailable, kpis, health, overdue, anomalies, recs, forecast, breakdown, vendors } = data;

  return (
    <motion.div initial="initial" animate="animate" variants={stagger} className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <motion.div variants={fadeUp}>
        <OnboardingBanner orgsCount={1} hasData={(kpis.revenue30d + kpis.expenses30d) > 0} />
      </motion.div>

      {aiAvailable === false ? (
        <motion.div variants={fadeUp}>
          <Card className="border-amber-500/40 bg-amber-500/[0.06]">
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-5 w-5" /></div>
                <div><p className="font-semibold">We&apos;re temporarily unable to reach the AI.</p><p className="mt-0.5 text-sm text-muted-foreground">Your financial analysis is complete and up to date. Please try again in a few moments.</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => mutate()}>Retry</Button>
                <a href="#kpis"><Button size="sm" variant="outline">View financial metrics</Button></a>
                <Link href="/cfo/reports"><Button size="sm" variant="ghost">Generate report without AI</Button></Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
      <motion.div variants={fadeUp}>
        <Card className="relative overflow-hidden border-foreground/15 bg-gradient-to-br from-foreground via-foreground/95 to-foreground/85 text-background">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-background/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-background/5 blur-3xl" />
          <CardHeader className="relative pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="border-background/30 bg-background/15 text-background hover:bg-background/20"><Sparkles className="mr-1 h-3 w-3" /> NexusAI CFO</Badge>
                <span className="text-xs text-background/60">Briefing for {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              <Badge className="hidden md:inline-flex border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="prose prose-invert max-w-none text-[15.5px] leading-relaxed text-background/90"><Markdown text={briefing} /></div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/cfo/chat"><Button size="sm" variant="secondary" className="bg-background text-foreground hover:bg-background/90"><MessageSquare className="mr-1.5 h-4 w-4" /> Ask follow-up</Button></Link>
              <Link href="/cfo/reports"><Button size="sm" variant="ghost" className="text-background hover:bg-background/10">Generate full report</Button></Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      )}

      {/* KPIs */}
      <motion.div id="kpis" variants={fadeUp} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Revenue (30d)" value={kpis.revenue30d} money delta={kpis.revDeltaPct} positiveGood />
        <Kpi icon={TrendingDown} label="Expenses (30d)" value={kpis.expenses30d} money delta={kpis.expDeltaPct} positiveGood={false} />
        <Kpi icon={Activity} label="Net profit (30d)" value={kpis.profit30d} money sub={kpis.revenue30d > 0 ? `${((kpis.profit30d / kpis.revenue30d) * 100).toFixed(1)}% margin` : ' '} />
        <Kpi icon={ShieldCheck} label="Cash runway" value={kpis.runwayDays == null ? Infinity : kpis.runwayDays} suffix={kpis.runwayDays == null ? '' : 'd'} plain sub={kpis.runwayDays == null ? 'Cash-flow positive' : `Burn $${fmt(kpis.burnRate)}/mo`} />
      </motion.div>

      {/* Health + Forecast */}
      <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-3">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader><CardTitle className="text-base">Business Health</CardTitle><CardDescription className="capitalize">{health.band.replace('_', ' ')}</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2"><div className="text-5xl font-semibold tracking-tight tabular-nums"><CountUp value={health.score} /></div><div className="text-sm text-muted-foreground">/ 100</div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-foreground/70 to-foreground" initial={{ width: 0 }} animate={{ width: `${health.score}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            <ul className="mt-5 space-y-2">
              {health.factors.map((f: any) => (
                <li key={f.label} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 inline-flex h-4 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums ${f.impact >= 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'}`}>{f.impact >= 0 ? '+' : ''}{f.impact}</span>
                  <div className="flex-1"><p className="font-medium text-foreground">{f.label}</p><p className="text-muted-foreground">{f.note}</p></div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div><CardTitle className="text-base">Cash flow forecast</CardTitle><CardDescription className="line-clamp-1">{forecast.narrative}</CardDescription></div>
              <Badge variant="secondary" className="shrink-0">{forecast.scheduledEvents} scheduled</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(s) => s.slice(5)} interval={Math.floor(forecast.series.length / 6)} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => `$${fmt(v)}`} />
                <Area type="monotone" dataKey="cash" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#cash)" isAnimationActive animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recs + Overdue + Anomalies */}
      <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">AI recommendations</CardTitle><CardDescription>Prioritized actions for this week</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {recs.map((r: any, i: number) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }}
                className="rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1"><p className="font-medium leading-snug">{r.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{r.reason}</p></div>
                  <Badge variant={r.impact === 'high' ? 'default' : 'secondary'} className="shrink-0 capitalize">{r.impact}</Badge>
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-foreground/80"><ArrowRight className="h-3 w-3" /> {r.action}</p>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader><CardTitle className="text-base">Overdue invoices</CardTitle><CardDescription>{overdue.length} requiring attention</CardDescription></CardHeader>
            <CardContent>
              {overdue.length === 0 ? <p className="text-sm text-muted-foreground">All invoices current — nice work.</p> : (
                <ul className="divide-y">{overdue.slice(0, 4).map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{i.vendor}</p><p className="text-xs text-muted-foreground">{i.invoiceNumber} · due {i.dueDate}</p></div>
                    <span className="font-mono text-sm tabular-nums">{$$$( i.amount )}</span>
                  </li>
                ))}</ul>
              )}
            </CardContent>
          </Card>
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader><CardTitle className="text-base">Anomalies detected</CardTitle><CardDescription>Unusual recent transactions</CardDescription></CardHeader>
            <CardContent>
              {anomalies.length === 0 ? <p className="text-sm text-muted-foreground">No anomalies detected.</p> : (
                <ul className="space-y-2">{anomalies.map((a: any) => (
                  <li key={a.transactionId} className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.vendor} — {$$$( a.amount )}</p><p className="text-xs text-muted-foreground">{a.reason}</p></div>
                  </li>
                ))}</ul>
              )}
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Expense + Top vendors */}
      <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-2">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader><CardTitle className="text-base">Expense breakdown</CardTitle><CardDescription>Last 30 days by category</CardDescription></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown.slice(0, 7)} dataKey="amount" nameKey="category" innerRadius={58} outerRadius={94} paddingAngle={2} stroke="hsl(var(--background))" strokeWidth={2} isAnimationActive animationDuration={800}>
                  {breakdown.slice(0, 7).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => `$${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader><CardTitle className="text-base">Top vendors</CardTitle><CardDescription>By total spend (90d)</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {vendors.slice(0, 7).map((v: any) => {
                const max = vendors[0]?.amount || 1;
                const pct = (v.amount / max) * 100;
                return (
                  <li key={v.vendor}>
                    <div className="flex items-center justify-between text-sm"><span className="font-medium">{v.vendor}</span><span className="font-mono tabular-nums">{$$$( v.amount )}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div className="h-full rounded-full bg-foreground/80" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function Kpi({ icon: Icon, label, value, delta, sub, positiveGood = true, money = false, plain = false, suffix = '' }: any) {
  const showDelta = typeof delta === 'number';
  const good = positiveGood ? delta >= 0 : delta <= 0;
  const isInfinite = value === Infinity;
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-foreground/10"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {isInfinite ? '∞' : money ? <CountUp value={Math.round(value)} prefix="$" /> : <CountUp value={value} suffix={suffix} />}
          </div>
          {showDelta && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{sub || (showDelta ? 'vs prior 30 days' : ' ')}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Card className="h-48"><CardContent className="space-y-3 p-6"><Skeleton className="h-4 w-24 shimmer" /><Skeleton className="h-7 w-2/3 shimmer" /><Skeleton className="h-4 w-1/2 shimmer" /><Skeleton className="h-4 w-1/3 shimmer" /></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-4">{[0,1,2,3].map(i => <Card key={i}><CardContent className="space-y-3 p-6"><Skeleton className="h-3 w-20 shimmer" /><Skeleton className="h-7 w-24 shimmer" /></CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Card className="h-80 shimmer lg:col-span-1" /><Card className="h-80 shimmer lg:col-span-2" /></div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0; let key = 0;
  const isNumLine = (l: string) => /^\s*\d+\.\s/.test(l);
  const isBulletLine = (l: string) => /^\s*\*\s/.test(l);
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
      nodes.push(<ol key={key++} className="list-decimal space-y-1 pl-5">{items.map((it, j) => <li key={j}><InlineMd text={it} /></li>)}</ol>);
      continue;
    }
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (isBulletLine(lines[i])) { items.push(lines[i].replace(/^\s*\*\s/, '')); i++; }
        else if (lines[i].trim() === '' && lines[i + 1] !== undefined && isBulletLine(lines[i + 1])) { i++; }
        else break;
      }
      nodes.push(<ul key={key++} className="space-y-1">{items.map((it, j) => <li key={j} className="flex gap-2"><span className="text-background/40">•</span><span className="flex-1"><InlineMd text={it} /></span></li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isNumLine(lines[i]) && !isBulletLine(lines[i])) { para.push(lines[i]); i++; }
    nodes.push(<p key={key++}><InlineMd text={para.join(' ')} /></p>);
  }
  return <div className="space-y-3">{nodes}</div>;
}
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold text-background">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}
