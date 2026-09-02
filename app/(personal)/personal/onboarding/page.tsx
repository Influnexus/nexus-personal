'use client';
// Personal onboarding + Edit Financial Information (P2.1 / P6). 7 numbers + one optional goal.
// After saving we RE-FETCH the persisted profile and show a deterministic confirmation summary
// before sending the user to the dashboard. No bank credentials. No unnecessary PII.
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock, Wallet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney } from '@/lib/personal/format';

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'monthlyIncome', label: 'Monthly income (take-home)' },
  { key: 'essentialMonthly', label: 'Essential monthly expenses', hint: 'rent, groceries, utilities, transport, insurance' },
  { key: 'discretionaryMonthly', label: 'Lifestyle monthly expenses', hint: 'dining, shopping, entertainment, subscriptions' },
  { key: 'cash', label: 'Current cash & savings' },
  { key: 'investments', label: 'Investments (total value)' },
  { key: 'totalDebt', label: 'Total debt outstanding' },
  { key: 'monthlyDebtPayment', label: 'Monthly debt payments (EMIs)' },
];

export default function PersonalOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get('edit') === '1';
  const [values, setValues] = useState<Record<string, string>>({});
  const [goal, setGoal] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  // Prefill from the saved profile (enables "Edit Financial Information").
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/personal/onboarding');
        if (!r.ok) return;
        const j = await r.json();
        if (j?.profile) {
          const p = j.profile;
          setValues({
            monthlyIncome: String(p.monthlyIncome ?? ''), essentialMonthly: String(p.essentialMonthly ?? ''),
            discretionaryMonthly: String(p.discretionaryMonthly ?? ''), cash: String(p.cash ?? ''),
            investments: String(p.investments ?? ''), totalDebt: String(p.totalDebt ?? ''),
            monthlyDebtPayment: String(p.monthlyDebtPayment ?? ''),
          });
          setGoal(p.goal ?? '');
          setCurrency(p.currency ?? 'INR');
        }
      } catch { /* first-time user — leave blank */ }
    })();
  }, []);

  const submit = async () => {
    const payload: Record<string, unknown> = { currency, goal: goal.trim() || null };
    for (const f of FIELDS) {
      const n = parseFloat((values[f.key] || '0').replace(/[,\s]/g, ''));
      if (isNaN(n) || n < 0) { toast.error(`Please enter a valid number for “${f.label}”.`); return; }
      payload[f.key] = n;
    }
    if ((payload.monthlyIncome as number) === 0 && (payload.cash as number) === 0) {
      toast.error('Please enter at least your income or your savings so we have something to work with.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/personal/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Could not save — please try again.'); setSubmitting(false); return; }
      setSummary(j.summary);       // show confirmation from RE-FETCHED persisted data
      setSubmitting(false);
    } catch {
      toast.error('Could not save — please try again.');
      setSubmitting(false);
    }
  };

  // ---- Confirmation summary (re-fetched + recomputed from the saved profile) ----
  if (summary?.profile) {
    const p = summary.profile; const m = summary.metrics; const c = summary.currency;
    const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
      </div>
    );
    return (
      <div className="mx-auto max-w-md pt-10" data-testid="onboarding-confirmation">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span>
          <h1 className="text-xl font-bold tracking-tight">Saved — here's your financial picture</h1>
          <p className="mt-1 text-sm text-muted-foreground">These values are now stored and power every Nexus Personal feature.</p>
        </div>
        <div className="space-y-1 rounded-2xl border border-border bg-card p-5">
          <Row label="Income" value={`${fmtMoney(p.monthlyIncome, c)}/month`} />
          <Row label="Essential" value={`${fmtMoney(p.essentialMonthly, c)}/month`} />
          <Row label="Lifestyle" value={`${fmtMoney(p.discretionaryMonthly, c)}/month`} />
          <div className="my-1 border-t border-border" />
          <Row label="Monthly expenses" value={`${fmtMoney(m.monthlyExpenses, c)}/month`} />
          <Row label="Monthly surplus" value={`${fmtMoney(m.monthlySurplus, c)}/month`} strong />
          <Row label="Savings rate" value={`${Math.round(m.savingsRate * 100)}%`} />
          <div className="my-1 border-t border-border" />
          <Row label="Cash & savings" value={fmtMoney(m.cash, c)} />
          <Row label="Investments" value={fmtMoney(m.investments, c)} />
          <Row label="Total financial assets" value={fmtMoney(m.financialAssets, c)} strong />
          <p className="pt-2 text-[11px] text-muted-foreground">No transaction data yet — spending-by-category analysis unlocks when you import transactions.</p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" size="lg" onClick={() => { router.push('/personal'); router.refresh(); }} data-testid="onboarding-goto-dashboard">Go to my dashboard</Button>
          <Button variant="outline" size="lg" onClick={() => setSummary(null)} data-testid="onboarding-edit-again">Edit</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-10" data-testid="personal-onboarding">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted"><Wallet className="h-5 w-5" /></span>
        <h1 className="text-xl font-bold tracking-tight">{isEdit ? 'Edit your financial information' : "Let's understand your money"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rough numbers are fine — takes about a minute. You can edit anytime.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger data-testid="onboarding-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key} data-testid={`onboarding-${f.key}`} inputMode="numeric" placeholder="0"
              value={values[f.key] || ''} onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            />
            {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="goal">One financial goal <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="goal" data-testid="onboarding-goal" placeholder="e.g. Build a 6-month emergency fund" maxLength={120} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <Button className="w-full" size="lg" onClick={submit} disabled={submitting} data-testid="onboarding-submit">
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {isEdit ? 'Save changes' : 'See my financial picture'}
        </Button>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> Stored privately. No bank login. No credit checks.</p>
      </div>
    </div>
  );
}
