'use client';
// Sprint P3 — Personal Forecast page. 90-day deterministic cash position forecast.
// Uses the shared forecastCash() engine. All numbers are computed server-side.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, Shield, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/client';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';

interface ForecastDay {
  day: string;
  cash: number;
  net: number;
  drivers?: { kind: string; label: string; amount: number }[];
}

interface ForecastResult {
  series: ForecastDay[];
  startingCash: number;
  endingCash: number;
  baselineDailyRev: number;
  baselineDailyExp: number;
  scheduledEvents: number;
  narrative: string;
  lowestDay: { day: string; cash: number };
}

interface DriverSummary {
  label: string;
  kind: string;
  monthlyAmount: number;
  direction: 'inflow' | 'outflow';
}

interface ForecastData {
  forecast: ForecastResult;
  currency: string;
  resilience: { resilienceMonths: number; essentialMonthly: number; liquidReserve: number };
  drivers: DriverSummary[];
  explanation: string;
  knownCount: number;
  projectedCount: number;
}

function formatMoney(amount: number, currency = 'INR'): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `${currency} ${Math.round(amount || 0).toLocaleString()}`;
  }
}

function formatCompact(amount: number, currency = 'INR'): string {
  const abs = Math.abs(amount || 0);
  const sign = amount < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${sign}₹${Math.round(abs)}`;
  }
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  if (abs >= 1000000) return `${sign}${sym}${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1000) return `${sign}${sym}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}${sym}${Math.round(abs)}`;
}

function formatShortDate(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Custom tooltip for the chart
function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground">{formatShortDate(data?.day || label)}</p>
      <p className="text-sm font-bold">{formatMoney(data?.cash || 0, currency)}</p>
      {data?.drivers?.length > 0 && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
          {data.drivers.map((d: any, i: number) => (
            <p key={i} className={`text-[11px] ${d.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {d.amount >= 0 ? '+' : ''}{formatMoney(d.amount, currency)} · {d.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PersonalForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driversExpanded, setDriversExpanded] = useState(false);

  const fetchForecast = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/personal/forecast');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
      track('personal_forecast_viewed');
    } catch (e: any) {
      setError(e.message || 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchForecast(); }, [fetchForecast]);

  if (loading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="flex items-center gap-2">
          <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold">Cash Forecast</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6 pt-8">
        <div className="flex items-center gap-2">
          <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold">Cash Forecast</h1>
        </div>
        <Card><CardContent className="py-12 text-center text-muted-foreground">{error || 'Unable to compute forecast. Add more transactions first.'}</CardContent></Card>
      </div>
    );
  }

  const { forecast, currency, resilience, drivers, explanation } = data;
  const change90d = forecast.endingCash - forecast.startingCash;
  const changePct = forecast.startingCash > 0 ? Math.round((change90d / forecast.startingCash) * 100) : 0;

  // Sample 30/60/90 day points for milestone display
  const day30 = forecast.series[29];
  const day60 = forecast.series[59];
  const day90 = forecast.series[forecast.series.length - 1];

  // Prepare chart data — sample every 3 days for performance
  const chartData = forecast.series.filter((_: any, i: number) => i % 3 === 0 || i === forecast.series.length - 1);
  const minCash = Math.min(...forecast.series.map((d: ForecastDay) => d.cash));
  const maxCash = Math.max(...forecast.series.map((d: ForecastDay) => d.cash));
  const yDomain = [Math.floor(minCash * 0.95), Math.ceil(maxCash * 1.05)];

  const isImproving = change90d >= 0;

  return (
    <div className="space-y-6 pt-8" data-testid="personal-forecast-page">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-xl font-bold">Cash Forecast</h1>
        <Badge variant="outline" className="ml-2 text-[10px]">90 days</Badge>
      </div>

      {/* Key metrics row */}
      <div className="grid gap-3 sm:grid-cols-4" data-testid="forecast-metrics">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Projected cash position</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatCompact(forecast.endingCash, currency)}</p>
            <p className="text-xs text-muted-foreground">in 90 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Projected 90-day change</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${change90d >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {change90d >= 0 ? '+' : ''}{formatCompact(change90d, currency)}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {isImproving ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
              {changePct >= 0 ? '+' : ''}{changePct}% vs today
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Lowest projected cash</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatCompact(forecast.lowestDay.cash, currency)}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatShortDate(forecast.lowestDay.day)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Projected resilience</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{resilience.resilienceMonths}<span className="text-base font-normal text-muted-foreground"> mo</span></p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              if income stopped
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash position chart */}
      <Card data-testid="forecast-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Where is my money going?
          </CardTitle>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Today: <b className="text-foreground">{formatMoney(forecast.startingCash, currency)}</b></span>
            <span>→</span>
            <span>30d: <b className="text-foreground">{formatMoney(day30?.cash || 0, currency)}</b></span>
            <span>→</span>
            <span>60d: <b className="text-foreground">{formatMoney(day60?.cash || 0, currency)}</b></span>
            <span>→</span>
            <span>90d: <b className="text-foreground">{formatMoney(day90?.cash || 0, currency)}</b></span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isImproving ? '#10b981' : '#ef4444'} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={isImproving ? '#10b981' : '#ef4444'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  interval={Math.floor(chartData.length / 5)}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(v: number) => formatCompact(v, currency)}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                  width={65}
                />
                <Tooltip content={<ChartTooltip currency={currency} />} />
                <ReferenceLine
                  y={forecast.startingCash}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  label={{ value: 'Today', position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Area
                  type="monotone"
                  dataKey="cash"
                  stroke={isImproving ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#cashGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: isImproving ? '#10b981' : '#ef4444' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">Known</b> data (entered transactions, detected patterns) is distinguished from <b className="text-foreground">Projected</b> values (expected recurring income/spending).
              Projections are not guaranteed outcomes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Forecast explanation */}
      <Card data-testid="forecast-explanation">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed">{explanation}</p>
        </CardContent>
      </Card>

      {/* Forecast drivers */}
      <Card data-testid="forecast-drivers">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground">What is driving the forecast?</CardTitle>
            <div className="flex gap-2 text-[11px]">
              <Badge variant="outline">{data.projectedCount} recurring</Badge>
              <Badge variant="outline">{data.knownCount} known events</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {drivers.slice(0, driversExpanded ? undefined : 6).map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    d.direction === 'inflow'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-red-500/10 text-red-500'
                  }`}>
                    {d.direction === 'inflow' ? '+' : '−'}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{d.kind.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${d.direction === 'inflow' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {d.direction === 'inflow' ? '+' : '−'}{formatMoney(Math.abs(d.monthlyAmount), currency)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
                </span>
              </div>
            ))}
          </div>
          {drivers.length > 6 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={() => { setDriversExpanded(!driversExpanded); track('personal_forecast_interaction', { feature: 'drivers_toggle' }); }}
            >
              {driversExpanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              {driversExpanded ? 'Show less' : `Show all ${drivers.length} drivers`}
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        All figures are computed deterministically from your transaction history — projections are not guaranteed outcomes.
        This is not regulated financial advice.
      </p>
    </div>
  );
}
