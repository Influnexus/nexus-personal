'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sliders, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

const fetcher = (u: string) => fetch(u).then(r => r.json());
function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function $$$(n: number) { return `$${fmt(Math.round(n))}`; }

export default function ScenarioSimulator() {
  const { data, isLoading } = useSWR('/api/cfo/briefing', fetcher, { revalidateOnFocus: false });
  const [revPct, setRevPct] = useState(0);
  const [expPct, setExpPct] = useState(0);

  const chartData = useMemo(() => {
    if (!data?.forecast) return [];
    const { baselineDailyRev, baselineDailyExp, series } = data.forecast;
    const adjRev = baselineDailyRev * (1 + revPct / 100);
    const adjExp = baselineDailyExp * (1 + expPct / 100);
    const delta = (adjRev - adjExp) - (baselineDailyRev - baselineDailyExp);
    return series.map((d: any, i: number) => ({ day: d.day, baseline: d.cash, scenario: Math.round(d.cash + delta * (i + 1)) }));
  }, [data, revPct, expPct]);

  const scenarioEnding = chartData.at(-1)?.scenario;
  const baselineEnding = chartData.at(-1)?.baseline;
  const scenarioRunwayDay = chartData.find((d: any) => d.scenario < 0)?.day;

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <Skeleton className="h-8 w-64 shimmer" />
        <Card className="h-96 shimmer" />
      </div>
    );
  }

  if (data?.error) {
    return <div className="mx-auto max-w-3xl p-6 md:p-12 text-center text-muted-foreground">Create a workspace to use the scenario simulator.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <div className="flex items-center gap-2"><Sliders className="h-5 w-5" /><h1 className="text-2xl font-semibold tracking-tight">Scenario Simulator</h1><Badge variant="secondary">Beta</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">Instantly see how revenue and expense changes affect your 90-day cash runway.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Adjust assumptions</CardTitle><CardDescription>Applied on top of your current baseline</CardDescription></CardHeader>
          <CardContent className="space-y-8">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Revenue growth</span><span className={`font-mono tabular-nums ${revPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{revPct > 0 ? '+' : ''}{revPct}%</span></div>
              <Slider value={[revPct]} min={-50} max={100} step={5} onValueChange={(v) => setRevPct(v[0])} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Expense change</span><span className={`font-mono tabular-nums ${expPct <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{expPct > 0 ? '+' : ''}{expPct}%</span></div>
              <Slider value={[expPct]} min={-50} max={100} step={5} onValueChange={(v) => setExpPct(v[0])} />
            </div>
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Baseline ending cash</span><span className="font-mono font-medium">{$$$( baselineEnding || 0 )}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Scenario ending cash</span><span className="flex items-center gap-1 font-mono font-medium">{scenarioEnding! >= (baselineEnding || 0) ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}{$$$( scenarioEnding || 0 )}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Runs out of cash</span><span className="font-medium">{scenarioRunwayDay ? scenarioRunwayDay : 'Not within 90 days'}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Projected cash — baseline vs. scenario</CardTitle><CardDescription>90-day horizon</CardDescription></CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="scenarioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.28} /><stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(s) => s.slice(5)} interval={Math.floor(chartData.length / 6)} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => `$${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="baseline" name="Baseline" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" fill="transparent" />
                <Area type="monotone" dataKey="scenario" name="Scenario" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#scenarioFill)" isAnimationActive animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
