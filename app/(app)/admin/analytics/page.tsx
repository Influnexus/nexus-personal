'use client';
// Private founder analytics view (Sprint 6 — Customer Validation). Gated server-side by
// FOUNDER_EMAILS; this page simply renders whatever the admin API allows.
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { Users, Sparkles, UserPlus, Zap, Repeat, Clock, AlertTriangle, MessageSquare, RefreshCw, ShieldAlert, TrendingDown } from 'lucide-react';

const FEATURE_LABELS: Record<string, string> = {
  dashboard_viewed: 'Dashboard views',
  cfo_chat_viewed: 'AI CFO chat opened',
  invoice_upload_completed: 'Invoices uploaded',
  csv_import_completed: 'CSV imports',
  report_generated: 'Reports generated',
  forecast_viewed: 'Forecast viewed',
  memory_page_viewed: 'Memory page viewed',
  memory_used: 'Memories created',
  billing_page_viewed: 'Billing page viewed',
  reports_page_viewed: 'Reports page viewed',
};

const RATING_LABELS: Record<string, { label: string; emoji: string }> = {
  very_useful: { label: 'Very useful', emoji: '\u{1F929}' },
  useful: { label: 'Useful', emoji: '\u{1F642}' },
  neutral: { label: 'Neutral', emoji: '\u{1F610}' },
  not_useful: { label: 'Not useful', emoji: '\u{1F615}' },
  broken: { label: 'Broken', emoji: '\u{1F6A8}' },
};

export default function FounderAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  const load = useCallback(async (r: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?range=${r}`);
      if (res.status === 403) { setError('forbidden'); return; }
      if (!res.ok) { setError('Failed to load analytics.'); return; }
      setData(await res.json());
    } catch {
      setError('Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  if (error === 'forbidden') {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="max-w-md text-center" data-testid="admin-analytics-forbidden">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-semibold">Founder access only</p>
            <p className="text-sm text-muted-foreground">This private analytics view is restricted to founder accounts configured on the server.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = data?.summary;
  const kpis = s ? [
    { label: 'Visitors', value: s.visitors, icon: Users },
    { label: 'Demo users', value: s.demoUsers, icon: Sparkles },
    { label: 'Signups', value: s.signups, icon: UserPlus },
    { label: 'Activated', value: s.activatedUsers, icon: Zap },
    { label: 'Returning', value: s.returningUsers, icon: Repeat },
    { label: 'Avg session', value: `${s.avgSessionMinutes}m`, icon: Clock },
  ] : [];

  const funnelMax = Math.max(1, ...(data?.funnel?.map((f: any) => f.value) || [1]));
  const ratingTotal = data ? Object.values(data.feedback.ratingDistribution as Record<string, number>).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="container space-y-6 py-8" data-testid="admin-analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Founder Analytics</h1>
          <p className="text-sm text-muted-foreground">Customer validation metrics — privacy-safe events only, no financial or conversation data.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((r) => (
            <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)} data-testid={`range-${r}`}>
              {r}d
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => load(range)} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => (
              <Card key={k.label} data-testid={`kpi-${k.label.toLowerCase().replace(/\s/g, '-')}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground"><k.icon className="h-4 w-4" /><span className="text-xs font-medium">{k.label}</span></div>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Funnel */}
          <Card data-testid="funnel-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversion funnel</CardTitle>
              <CardDescription>Landing → demo → first AI answer → signup → trial, with drop-off between steps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.funnel.map((f: any, i: number) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{f.label}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {i > 0 && f.dropOffFromPrev > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><TrendingDown className="h-3 w-3" />-{f.dropOffFromPrev}%</span>
                      )}
                      <span className="font-semibold">{f.value}</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground/80 transition-all" style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Trends */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="daily-trend-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Daily trend</CardTitle><CardDescription>Visits, demo starts, signups &amp; AI messages per day.</CardDescription></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="visits" name="Visits" stackId="1" stroke="#6366f1" fill="#6366f133" />
                    <Area type="monotone" dataKey="demoStarts" name="Demo starts" stackId="2" stroke="#22c55e" fill="#22c55e33" />
                    <Area type="monotone" dataKey="signups" name="Signups" stackId="3" stroke="#f59e0b" fill="#f59e0b33" />
                    <Area type="monotone" dataKey="aiMessages" name="AI messages" stackId="4" stroke="#06b6d4" fill="#06b6d433" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card data-testid="weekly-trend-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Weekly trend</CardTitle><CardDescription>Aggregated by week (Monday start).</CardDescription></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="visits" name="Visits" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="demoStarts" name="Demo starts" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="signups" name="Signups" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="aiMessages" name="AI messages" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* AI usage / adoption / errors */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card data-testid="ai-usage-card">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> AI CFO usage</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Questions asked</span><span className="font-semibold tabular-nums">{data.aiUsage.questions}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Answers completed</span><span className="font-semibold tabular-nums">{data.aiUsage.completed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Failures</span><span className="font-semibold tabular-nums">{data.aiUsage.failed}</span></div>
                <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Success rate</span><Badge variant={data.aiUsage.successRate >= 95 ? 'default' : 'destructive'}>{data.aiUsage.successRate}%</Badge></div>
              </CardContent>
            </Card>
            <Card data-testid="feature-adoption-card">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Feature adoption</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {data.featureAdoption.length === 0 && <p className="text-muted-foreground">No feature usage yet.</p>}
                {data.featureAdoption.map((f: any) => (
                  <div key={f.event} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{FEATURE_LABELS[f.event] || f.event}</span>
                    <span className="tabular-nums"><span className="font-semibold">{f.count}</span> <span className="text-xs text-muted-foreground">({f.orgs} org{f.orgs === 1 ? '' : 's'})</span></span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card data-testid="errors-card">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Errors &amp; failures</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice uploads failed</span><span className="font-semibold tabular-nums">{data.errors.invoiceUploadFailed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CSV imports failed</span><span className="font-semibold tabular-nums">{data.errors.csvImportFailed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">AI responses failed</span><span className="font-semibold tabular-nums">{data.errors.cfoResponseFailed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reports failed</span><span className="font-semibold tabular-nums">{data.errors.reportFailed}</span></div>
                <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Total failures</span><Badge variant={data.errors.total > 0 ? 'destructive' : 'secondary'}>{data.errors.total}</Badge></div>
              </CardContent>
            </Card>
          </div>

          {/* Feedback */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card data-testid="feedback-distribution-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Experience ratings</CardTitle><CardDescription>{ratingTotal} rating{ratingTotal === 1 ? '' : 's'} in range</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(RATING_LABELS).map(([key, r]) => {
                  const n = data.feedback.ratingDistribution[key] || 0;
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between text-xs"><span>{r.emoji} {r.label}</span><span className="font-semibold tabular-nums">{n}</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${key === 'broken' ? 'bg-red-500' : key === 'not_useful' ? 'bg-orange-400' : 'bg-emerald-500'}`} style={{ width: `${ratingTotal ? Math.max(n ? 4 : 0, (n / ratingTotal) * 100) : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2" data-testid="feedback-recent-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recent feedback &amp; problem reports</CardTitle></CardHeader>
              <CardContent>
                {data.feedback.recent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No feedback submitted yet.</p>
                ) : (
                  <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                    {data.feedback.recent.map((f: any) => (
                      <div key={f.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          {f.type === 'problem'
                            ? <Badge variant="destructive" className="text-[10px]">Problem</Badge>
                            : <Badge variant="secondary" className="text-[10px]">{RATING_LABELS[f.rating]?.emoji} {RATING_LABELS[f.rating]?.label || f.rating}</Badge>}
                          {f.feature && <Badge variant="outline" className="text-[10px]">{f.feature}</Badge>}
                          {f.isDemo && <Badge variant="outline" className="text-[10px]">demo</Badge>}
                          {f.page && <span className="text-[11px] text-muted-foreground">{f.page}</span>}
                          {f.errorId && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{f.errorId}</span>}
                          <span className="ml-auto text-[11px] text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
                        </div>
                        {f.text && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-foreground/90">{f.text}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Generated {new Date(data.generatedAt).toLocaleString()} · Last {data.rangeDays} days · Analytics store contains no financial data, document contents or conversation text.
          </p>
        </>
      )}
      {error && error !== 'forbidden' && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
