'use client';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  CheckCircle2, Sparkles, Clock, CreditCard, FileText, Building2, Printer, RotateCcw,
  AlertTriangle, ShieldCheck, MapPin, TrendingUp,
} from 'lucide-react';
import { RazorpayPayButton } from '@/components/app/RazorpayPayButton';

const fetcher = (u: string) => fetch(u).then(r => r.json());

type PlanId = 'starter' | 'growth' | 'enterprise';
type Interval = 'monthly' | 'yearly';
type Region = 'IN' | 'INTL';

function fmtMoney(n: number, currency: 'USD' | 'INR') {
  const symbol = currency === 'USD' ? '$' : '\u20b9';
  return `${symbol}${n.toLocaleString()}`;
}

export default function BillingPage() {
  const { data, mutate, isLoading } = useSWR('/api/billing/subscription', fetcher);
  const [interval, setIntervalState] = useState<Interval>('monthly');
  const [region, setRegion] = useState<Region>('INTL');
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);

  // Best-effort region auto-detect (no geo-IP key available) — purely a UX default, always overridable.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (/Kolkata|Calcutta/i.test(tz)) setRegion('IN');
    } catch { /* ignore */ }
  }, []);

  const sub = data?.subscription;
  const plans = data?.plans as Record<PlanId, any> | undefined;
  const usage = data?.usage;
  const currency: 'USD' | 'INR' = region === 'IN' ? 'INR' : 'USD';
  const providerName = region === 'IN' ? 'Razorpay' : 'Stripe';

  async function startTrial(plan: PlanId) {
    if (plan === 'enterprise') { window.location.href = 'mailto:sales@nexusai.com?subject=Enterprise%20plan%20inquiry'; return; }
    setBusyPlan(plan);
    try {
      const res = await fetch('/api/billing/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, interval, region }) });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Could not start trial'); return; }
      toast.success(`14-day ${plans?.[plan]?.name || plan} trial started — no payment required.`);
      mutate();
    } finally { setBusyPlan(null); }
  }

  async function changePlan(plan: PlanId) {
    if (plan === 'enterprise') { window.location.href = 'mailto:sales@nexusai.com?subject=Enterprise%20plan%20inquiry'; return; }
    setBusyPlan(plan);
    try {
      const res = await fetch('/api/billing/plan', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, interval }) });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Could not change plan'); return; }
      toast.success(`Switched to ${plans?.[plan]?.name || plan}.`);
      mutate();
    } finally { setBusyPlan(null); }
  }

  async function cancel(immediate: boolean) {
    const res = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ immediate }) });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Could not cancel'); return; }
    toast.success(immediate ? 'Subscription canceled.' : 'Your plan will end at the end of this trial period.');
    mutate();
  }

  async function resume() {
    const res = await fetch('/api/billing/resume', { method: 'POST' });
    if (!res.ok) { toast.error('Could not resume'); return; }
    toast.success('Subscription resumed.');
    mutate();
  }

  async function manageBilling() {
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) { toast.info(d.message || 'Billing portal is not available yet.'); return; }
    window.location.href = d.url;
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <Skeleton className="h-8 w-48 shimmer" />
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <Card key={i} className="h-80 shimmer" />)}</div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your plan, usage and payment details.</p>
        </div>
        <RegionToggle region={region} onChange={setRegion} />
      </div>

      {sub ? (
        <>
          <CurrentPlanCard sub={sub} plans={plans} currency={currency} onCancel={cancel} onResume={resume} onManage={manageBilling} />
          {usage && <UsageDashboard usage={usage} />}
        </>
      ) : (
        <TrialCallout />
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{sub ? 'Change plan' : 'Choose a plan'}</h2>
          <IntervalToggle interval={interval} onChange={setIntervalState} />
        </div>
        <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Billed via {providerName} {region === 'IN' ? '(India)' : '(International)'} — switch above if this is wrong.</p>
        {plans && (
          <PlanGrid
            plans={plans} currency={currency} interval={interval} currentPlan={sub?.plan} region={region}
            busyPlan={busyPlan} onSelect={sub ? changePlan : startTrial} onPaid={() => mutate()}
            actionLabel={sub ? 'Switch to this plan' : 'Start 14-day free trial'}
          />
        )}
      </div>

      {sub && <InvoiceHistorySection />}
      {sub && <PaymentMethodsSection onAdd={() => changePlan(sub.plan)} providerName={providerName} />}
    </motion.div>
  );
}

function RegionToggle({ region, onChange }: { region: Region; onChange: (r: Region) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/40 p-1 text-sm">
      <button onClick={() => onChange('INTL')} className={`rounded-full px-3 py-1 transition ${region === 'INTL' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>International (USD)</button>
      <button onClick={() => onChange('IN')} className={`rounded-full px-3 py-1 transition ${region === 'IN' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>India (INR)</button>
    </div>
  );
}

function IntervalToggle({ interval, onChange }: { interval: Interval; onChange: (i: Interval) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="interval-toggle" className={interval === 'monthly' ? 'font-medium' : 'text-muted-foreground'}>Monthly</Label>
      <Switch id="interval-toggle" checked={interval === 'yearly'} onCheckedChange={(v) => onChange(v ? 'yearly' : 'monthly')} />
      <Label htmlFor="interval-toggle" className={interval === 'yearly' ? 'font-medium' : 'text-muted-foreground'}>Yearly <Badge variant="secondary" className="ml-1">Save 20%</Badge></Label>
    </div>
  );
}

function TrialCallout() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Sparkles className="h-7 w-7" />
        <p className="font-medium">No active plan yet</p>
        <p className="max-w-md text-sm text-muted-foreground">Start a 14-day free trial — no payment required. Pick a plan below to get going in seconds.</p>
      </CardContent>
    </Card>
  );
}

function statusMeta(status: string) {
  switch (status) {
    case 'trialing': return { label: 'Trial', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' };
    case 'active': return { label: 'Active', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
    case 'trial_expired': return { label: 'Trial ended', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    case 'past_due': return { label: 'Past due', color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' };
    case 'canceled': return { label: 'Canceled', color: 'bg-muted text-muted-foreground' };
    default: return { label: status, color: 'bg-muted text-muted-foreground' };
  }
}

function CurrentPlanCard({ sub, plans, currency, onCancel, onResume, onManage }: any) {
  const def = plans?.[sub.plan];
  const meta = statusMeta(sub.status);
  const daysLeft = sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <Card className="relative overflow-hidden border-foreground/15">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-foreground to-foreground/70 text-background"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2"><p className="text-lg font-semibold">{def?.name || sub.plan}</p><Badge className={meta.color}>{meta.label}</Badge></div>
            <p className="text-sm text-muted-foreground capitalize">{sub.interval} billing{sub.cancelAtPeriodEnd ? ' · ending at period end' : ''}</p>
            {sub.status === 'trialing' && daysLeft !== null && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {daysLeft} day{daysLeft === 1 ? '' : 's'} left in your free trial</p>
            )}
            {sub.status === 'trial_expired' && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> Your trial has ended — pick a plan below to keep full access.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onManage}><CreditCard className="mr-2 h-4 w-4" /> Manage billing</Button>
          {sub.cancelAtPeriodEnd ? (
            <Button variant="outline" onClick={onResume}><RotateCcw className="mr-2 h-4 w-4" /> Resume</Button>
          ) : sub.status !== 'canceled' && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" className="text-rose-600 hover:text-rose-700 dark:text-rose-400">Cancel</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Cancel your subscription?</AlertDialogTitle><AlertDialogDescription>You&apos;ll keep access until the end of your current period, then lose access to paid features.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Keep plan</AlertDialogCancel><AlertDialogAction onClick={() => onCancel(false)}>Cancel at period end</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UsageDashboard({ usage }: { usage: { period: string; usage: { metric: string; used: number; limit: number }[] } }) {
  const LABELS: Record<string, string> = { ai_messages: 'AI CFO messages', invoices_processed: 'Invoices processed', csv_imports: 'CSV imports' };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /><h2 className="text-lg font-semibold">Usage this period</h2><span className="text-xs text-muted-foreground">({usage.period})</span></div>
      <div className="grid gap-4 md:grid-cols-3">
        {usage.usage.map(u => {
          const pct = u.limit === Infinity ? 0 : Math.min(100, Math.round((u.used / u.limit) * 100));
          const near = pct >= 80;
          return (
            <Card key={u.metric}>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-muted-foreground">{LABELS[u.metric] || u.metric}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums">{u.used}</span>
                  <span className="text-sm text-muted-foreground">/ {u.limit === Infinity ? '∞' : u.limit}</span>
                </div>
                {u.limit !== Infinity && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${near ? 'bg-amber-500' : 'bg-foreground/80'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PlanGrid({ plans, currency, interval, currentPlan, busyPlan, onSelect, actionLabel, region, onPaid }: any) {
  const order: PlanId[] = ['starter', 'growth', 'enterprise'];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {order.map((id) => {
        const p = plans[id];
        const isCurrent = currentPlan === id;
        const priceBase = currency === 'USD' ? p.priceMonthlyUsd : p.priceMonthlyInr;
        const price = priceBase == null ? null : interval === 'monthly' ? priceBase : Math.round(priceBase * 12 * (1 - p.yearlyDiscountPct / 100) / 12);
        return (
          <Card key={id} className={isCurrent ? 'border-foreground shadow-sm' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between"><CardTitle className="text-base">{p.name}</CardTitle>{isCurrent && <Badge>Current</Badge>}</div>
              <CardDescription className="min-h-[40px]">{p.tagline}</CardDescription>
              <div className="pt-2">
                {price == null ? (
                  <span className="text-2xl font-semibold">Custom</span>
                ) : (
                  <><span className="text-2xl font-semibold text-foreground">{fmtMoney(price, currency)}</span><span className="text-muted-foreground"> /mo</span>{interval === 'yearly' && <div className="text-xs text-muted-foreground">billed yearly</div>}</>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {p.features.map((f: string) => <li key={f} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" /> {f}</li>)}
              </ul>
              <Button className="w-full" variant={isCurrent ? 'outline' : 'default'} disabled={isCurrent || busyPlan === id} onClick={() => onSelect(id)}>
                {busyPlan === id ? 'Please wait…' : isCurrent ? 'Current plan' : id === 'enterprise' ? 'Contact sales' : actionLabel}
              </Button>
              {region === 'IN' && (id === 'starter' || id === 'growth') && !isCurrent && (
                <RazorpayPayButton plan={id} interval={interval} onVerified={onPaid} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InvoiceHistorySection() {
  const { data, isLoading } = useSWR('/api/billing/invoices', fetcher);
  const invoices = data?.invoices || [];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /><h2 className="text-lg font-semibold">Invoice history</h2></div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <FileText className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No invoices yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">Trials are free — your first invoice will appear here once billing begins.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {invoices.map((inv: any) => (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3">
                  <div><p className="text-sm font-medium">{new Date(inv.issuedAt).toLocaleDateString()}</p><p className="text-xs text-muted-foreground capitalize">{inv.status} · {inv.provider}</p></div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{inv.currency} {inv.amount.toLocaleString()}</span>
                    <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer className="mr-1.5 h-3.5 w-3.5" /> Tax invoice</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentMethodsSection({ onAdd, providerName }: { onAdd: () => void; providerName: string }) {
  const { data, isLoading } = useSWR('/api/billing/payment-methods', fetcher);
  const methods = data?.paymentMethods || [];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4" /><h2 className="text-lg font-semibold">Payment methods</h2></div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : methods.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Building2 className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No payment method on file</p>
              <p className="max-w-sm text-xs text-muted-foreground">Add one when you&apos;re ready to continue past your trial — processed securely via {providerName}.</p>
              <Button size="sm" variant="outline" onClick={onAdd}>Add payment method</Button>
            </div>
          ) : (
            <ul className="divide-y">
              {methods.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{m.brand} •••• {m.last4}</span>
                  {m.isDefault && <Badge variant="secondary">Default</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
