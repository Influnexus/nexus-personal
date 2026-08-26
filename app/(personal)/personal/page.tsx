// Nexus Personal dashboard (Sprint P2, extended Sprint P3 — Alerts + Forecast links).
// Every number on this page is computed deterministically by lib/core/finance. No LLM math.
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { personalService } from '@/lib/services/personal.service';
import { HealthCard } from '@/components/personal/HealthCard';
import { ResilienceCard } from '@/components/personal/ResilienceCard';
import { fmtMoney, fmtMoneyCompact } from '@/lib/personal/format';
import { Button } from '@/components/ui/button';
import { ArrowDownRight, ArrowUpRight, AlertTriangle, AlertCircle, Info, MessageCircle, SlidersHorizontal, Target, TrendingUp, TrendingDown, LineChart, Bell, ChevronRight } from 'lucide-react';

function changeCopy(c: any, currency: string): { text: string } {
  const money = (n?: number) => fmtMoney(n || 0, currency);
  switch (c.kind) {
    case 'spending_trend': return { text: `Spending ${c.direction === 'up' ? 'increased' : 'decreased'} ${c.pct}% this month.` };
    case 'income_change': return { text: `Income ${c.direction === 'up' ? 'increased' : 'decreased'} ${c.pct}% vs last month.` };
    case 'category_change': return { text: `${c.category} spending ${c.direction === 'up' ? 'increased' : 'decreased'} ${money(c.amount)}.` };
    case 'reserve_change': return { text: `Your cash reserve ${c.direction === 'up' ? 'improved' : 'decreased'} by ${money(c.amount)}.` };
    case 'savings_rate_change': return { text: c.detail || `Savings rate ${c.direction === 'up' ? 'improved' : 'decreased'} by ${c.pct} percentage points.` };
    case 'resilience_change': return { text: c.detail || `Financial resilience ${c.direction === 'up' ? 'improved' : 'decreased'}.` };
    case 'forecast_direction': return { text: c.detail || `Your 90-day forecast ${c.direction === 'up' ? 'improved' : 'worsened'}.` };
    default: return { text: '' };
  }
}

export default async function PersonalDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) redirect('/personal/onboarding');
  const o = await personalService.getOverview(ws);
  if (!o.hasProfile && o.state.transactionCount === 0) redirect('/personal/onboarding');

  const cur = o.currency;
  const s = o.state;

  return (
    <div className="space-y-8 pt-8" data-testid="personal-dashboard">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi{session.user.name ? ` ${session.user.name.split(' ')[0]}` : ''} 👋</h1>
        <p className="mt-1 text-muted-foreground">Know what happens to your money next.</p>
        {o.goal && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground" data-testid="personal-goal">
            <Target className="h-3 w-3" /> Goal: {o.goal}
          </div>
        )}
      </div>

      {/* The three answers */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthCard health={o.health} />
        <ResilienceCard resilience={o.resilience} currency={cur} />
        <div className="flex flex-col rounded-2xl border border-border bg-card p-5" data-testid="personal-surplus-card">
          <span className="text-xs font-medium text-muted-foreground">Monthly surplus</span>
          <span className={`mt-1.5 text-3xl font-bold tabular-nums ${s.surplus30d < 0 ? 'text-red-500' : ''}`}>{fmtMoney(s.surplus30d, cur)}</span>
          <span className="mt-1 text-sm text-muted-foreground">income − spending, last 30 days</span>
        </div>
      </div>

      {/* P3: Needs your attention — max 3 highest-priority alerts */}
      {o.alerts.length > 0 && (
        <section data-testid="personal-alerts-summary">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Needs your attention</h2>
            <Link href="/personal/alerts" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
            {o.alerts.map((alert: any) => {
              const isCritical = alert.severity === 'critical';
              const isWarning = alert.severity === 'warning';
              const AlertIcon = isCritical ? AlertTriangle : isWarning ? AlertCircle : Info;
              const colorClass = isCritical
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : isWarning
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
              return (
                <Link key={alert.id} href="/personal/alerts" className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                    <AlertIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{alert.explanation}</p>
                  </div>
                  {alert.metric && <span className="shrink-0 mt-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono tabular-nums">{alert.metric}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* What changed? */}
      <section data-testid="personal-what-changed">
        <h2 className="text-sm font-semibold text-muted-foreground">What changed?</h2>
        <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
          {o.changes.length === 0 && (
            <p className="px-4 py-4 text-sm text-muted-foreground">Nothing significant changed in the last month. That's usually good news.</p>
          )}
          {o.changes.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.tone === 'positive' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : c.tone === 'negative' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                {c.direction === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              </span>
              <p className="text-sm">{changeCopy(c, cur).text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Where your money goes */}
      <section data-testid="personal-money-goes">
        <h2 className="text-sm font-semibold text-muted-foreground">Where your money goes <span className="font-normal">· last 30 days</span></h2>
        <div className="mt-2 space-y-2.5 rounded-2xl border border-border bg-card p-4">
          {s.topCategories.length === 0 && <p className="text-sm text-muted-foreground">No spending recorded yet.</p>}
          {s.topCategories.map((c: any) => (
            <div key={c.category}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{c.category}</span>
                <span className="tabular-nums text-muted-foreground">{fmtMoney(c.amount, cur)} <span className="text-xs">({Math.round(c.share * 100)}%)</span></span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(3, c.share * 100)}%` }} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>Essentials: <b className="text-foreground">{fmtMoney(s.essential30d, cur)}</b></span>
            <span>Lifestyle: <b className="text-foreground">{fmtMoney(s.discretionary30d, cur)}</b></span>
            <span>Fixed bills: <b className="text-foreground">{fmtMoney(s.fixedMonthly, cur)}/mo</b></span>
            {s.investing30d > 0 && <span>Invested: <b className="text-foreground">{fmtMoney(s.investing30d, cur)}</b></span>}
          </div>
        </div>
      </section>

      {/* Your financial position */}
      <section data-testid="personal-position">
        <h2 className="text-sm font-semibold text-muted-foreground">Your financial position</h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Cash &amp; savings</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoneyCompact(o.position.cash, cur)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Investments</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoneyCompact(o.position.investments, cur)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Debt</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{o.position.totalDebt > 0 ? fmtMoneyCompact(o.position.totalDebt, cur) : '—'}</p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" /> Net position: <b className="text-foreground">{fmtMoneyCompact(o.position.netWorth, cur)}</b></p>
      </section>

      {/* CTAs */}
      <section className="flex flex-col gap-2 sm:flex-row" data-testid="personal-ctas">
        <Button asChild size="lg" className="flex-1">
          <Link href="/personal/forecast" data-testid="cta-forecast"><LineChart className="mr-1.5 h-4 w-4" /> Cash Forecast</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="flex-1">
          <Link href="/personal/alerts" data-testid="cta-alerts"><Bell className="mr-1.5 h-4 w-4" /> All Alerts</Link>
        </Button>
      </section>

      <p className="text-center text-[11px] text-muted-foreground">All figures are computed deterministically from your transactions — never estimated by AI. {o.health.disclaimer}</p>
    </div>
  );
}
