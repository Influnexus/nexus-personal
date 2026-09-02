'use client';
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { fmtMoney } from '@/lib/personal/format';
import { TrendingUp, TrendingDown, Target, Info, ArrowUpRight, CheckCircle2, AlertTriangle } from 'lucide-react';

interface FI {
  currency: string; multiplier: number; currentAssets: number; essentialMonthly: number; essentialAnnual: number;
  monthlySurplus: number; savingsRate: number; fiTarget: number; fiProgressPct: number; fiGap: number;
  monthsToFI: number | null; yearsToFI: number | null; status: string;
  helping: { key: string; label: string; detail: string }[];
  slowing: { key: string; label: string; detail: string }[];
  nextActions: { key: string; title: string; detail: string; impact: string }[];
  assumptionNote: string; disclaimer: string;
}

const STATUS_LABEL: Record<string, string> = {
  financially_free: 'Financially free', on_track: 'On track', building: 'Building momentum',
  early: 'Early days', not_progressing: 'Not progressing yet',
};

export default function FinancialFreedomPage() {
  const [data, setData] = useState<{ freedom: FI; currency: string; hasProfile: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/personal/financial-freedom');
        if (!r.ok) throw new Error(r.status === 404 ? 'no_workspace' : 'failed');
        setData(await r.json());
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading your Financial Freedom assessment…</div>;
  if (err || !data) return (
    <div className="py-16 text-center">
      <p className="text-sm text-muted-foreground">Complete your financial profile to see your Financial Freedom assessment.</p>
      <a href="/personal/onboarding" className="mt-3 inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background">Set up my profile</a>
    </div>
  );

  const fi = data.freedom;
  const c = data.currency;
  const noProfile = !data.hasProfile || (fi.essentialMonthly === 0 && fi.currentAssets === 0);

  if (noProfile) return (
    <div className="py-16 text-center">
      <Target className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold">Set up your profile first</h2>
      <p className="mt-1 text-sm text-muted-foreground">Financial Freedom is calculated from your income, expenses, cash and investments.</p>
      <a href="/personal/onboarding" className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-sm text-background">Enter my financial information</a>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Financial Freedom</h1>
        <p className="text-sm text-muted-foreground">How close are you to financial independence — and what moves the needle.</p>
      </div>

      {/* Progress hero */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Progress to financial freedom</CardTitle>
            <Badge variant="secondary">{STATUS_LABEL[fi.status] ?? fi.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-3xl font-semibold" data-testid="fi-progress">{fi.fiProgressPct}%</div>
            <div className="text-sm text-muted-foreground">
              {fmtMoney(fi.currentAssets, c)} of {fmtMoney(fi.fiTarget, c)} target
            </div>
          </div>
          <Progress value={Math.min(100, fi.fiProgressPct)} className="h-3" />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>Remaining gap: <b className="text-foreground">{fmtMoney(fi.fiGap, c)}</b></span>
            {fi.yearsToFI != null ? (
              <span>Estimated trajectory: <b className="text-foreground">~{fi.yearsToFI} years</b> at current surplus</span>
            ) : (
              <span className="text-amber-600">No monthly surplus yet — build one to start progressing.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Key numbers (deterministic, from profile) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Financial assets" value={fmtMoney(fi.currentAssets, c)} sub="Cash + investments" />
        <Metric label="Essential / month" value={fmtMoney(fi.essentialMonthly, c)} sub={`${fmtMoney(fi.essentialAnnual, c)}/yr`} />
        <Metric label="Monthly surplus" value={fmtMoney(fi.monthlySurplus, c)} sub={`Savings rate ${Math.round(fi.savingsRate * 100)}%`} />
        <Metric label="FI target" value={fmtMoney(fi.fiTarget, c)} sub={`${fi.multiplier}× annual essentials`} />
        <Metric label="Current assets" value={fmtMoney(fi.currentAssets, c)} sub="Toward FI" />
        <Metric label="Gap remaining" value={fmtMoney(fi.fiGap, c)} sub="To reach target" />
      </div>

      {/* Helping / slowing */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-emerald-600" /> Helping your progress</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {fi.helping.length === 0 ? <p className="text-sm text-muted-foreground">No strong tailwinds detected yet.</p> :
              fi.helping.map(f => (<div key={f.key} className="text-sm"><b>{f.label}</b><p className="text-muted-foreground">{f.detail}</p></div>))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4 text-amber-600" /> Slowing your progress</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {fi.slowing.length === 0 ? <p className="text-sm text-muted-foreground">Nothing significant slowing you down.</p> :
              fi.slowing.map(f => (<div key={f.key} className="text-sm"><b>{f.label}</b><p className="text-muted-foreground">{f.detail}</p></div>))}
          </CardContent>
        </Card>
      </div>

      {/* Next actions */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ArrowUpRight className="h-4 w-4" /> Highest-impact next actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fi.nextActions.map(a => (
            <div key={a.key} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
              <div className="text-sm">
                <div className="flex items-center gap-2"><b>{a.title}</b><Badge variant="outline" className="text-[10px]">{a.impact} impact</Badge></div>
                <p className="text-muted-foreground">{a.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Assumptions */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><b className="text-foreground">Assumption:</b> {fi.assumptionNote}</p>
            <p>{fi.disclaimer}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
