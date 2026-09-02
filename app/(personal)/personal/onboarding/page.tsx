'use client';
// Personal onboarding (P2.1) — deliberately short: 7 numbers + one optional goal.
// No bank credentials. No unnecessary personal information.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock, Wallet } from 'lucide-react';
import { toast } from 'sonner';

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [goal, setGoal] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [submitting, setSubmitting] = useState(false);

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
      router.push('/personal');
      router.refresh();
    } catch {
      toast.error('Could not save — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-10" data-testid="personal-onboarding">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted"><Wallet className="h-5 w-5" /></span>
        <h1 className="text-xl font-bold tracking-tight">Let's understand your money</h1>
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
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} See my financial picture
        </Button>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> Stored privately. No bank login. No credit checks.</p>
      </div>
    </div>
  );
}
