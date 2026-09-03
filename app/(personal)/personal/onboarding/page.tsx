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
import { useT } from '@/components/personal/i18n-provider';

const FIELDS: { key: string; labelKey: string; hintKey?: string }[] = [
  { key: 'monthlyIncome', labelKey: 'onboarding.field.monthlyIncome' },
  { key: 'essentialMonthly', labelKey: 'onboarding.field.essentialMonthly', hintKey: 'onboarding.field.essentialHint' },
  { key: 'discretionaryMonthly', labelKey: 'onboarding.field.discretionaryMonthly', hintKey: 'onboarding.field.discretionaryHint' },
  { key: 'cash', labelKey: 'onboarding.field.cash' },
  { key: 'investments', labelKey: 'onboarding.field.investments' },
  { key: 'totalDebt', labelKey: 'onboarding.field.totalDebt' },
  { key: 'monthlyDebtPayment', labelKey: 'onboarding.field.monthlyDebtPayment' },
];

export default function PersonalOnboardingPage() {
  const t = useT();
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
      if (isNaN(n) || n < 0) { toast.error(t('onboarding.errInvalid', { label: t(f.labelKey) })); return; }
      payload[f.key] = n;
    }
    if ((payload.monthlyIncome as number) === 0 && (payload.cash as number) === 0) {
      toast.error(t('onboarding.errMinimum'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/personal/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || t('onboarding.errSave')); setSubmitting(false); return; }
      setSummary(j.summary);       // show confirmation from RE-FETCHED persisted data
      setSubmitting(false);
    } catch {
      toast.error(t('onboarding.errSave'));
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
          <h1 className="text-xl font-bold tracking-tight">{t('onboarding.savedTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.savedSubtitle')}</p>
        </div>
        <div className="space-y-1 rounded-2xl border border-border bg-card p-5">
          <Row label={t('onboarding.rowIncome')} value={t('unit.perMonth', { value: fmtMoney(p.monthlyIncome, c) })} />
          <Row label={t('onboarding.rowEssential')} value={t('unit.perMonth', { value: fmtMoney(p.essentialMonthly, c) })} />
          <Row label={t('onboarding.rowLifestyle')} value={t('unit.perMonth', { value: fmtMoney(p.discretionaryMonthly, c) })} />
          <div className="my-1 border-t border-border" />
          <Row label={t('onboarding.rowMonthlyExpenses')} value={t('unit.perMonth', { value: fmtMoney(m.monthlyExpenses, c) })} />
          <Row label={t('onboarding.rowMonthlySurplus')} value={t('unit.perMonth', { value: fmtMoney(m.monthlySurplus, c) })} strong />
          <Row label={t('onboarding.rowSavingsRate')} value={`${Math.round(m.savingsRate * 100)}%`} />
          <div className="my-1 border-t border-border" />
          <Row label={t('onboarding.rowCash')} value={fmtMoney(m.cash, c)} />
          <Row label={t('onboarding.rowInvestments')} value={fmtMoney(m.investments, c)} />
          <Row label={t('onboarding.rowAssets')} value={fmtMoney(m.financialAssets, c)} strong />
          <p className="pt-2 text-[11px] text-muted-foreground">{t('onboarding.noTxNote')}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" size="lg" onClick={() => { router.push('/personal'); router.refresh(); }} data-testid="onboarding-goto-dashboard">{t('onboarding.gotoDashboard')}</Button>
          <Button variant="outline" size="lg" onClick={() => setSummary(null)} data-testid="onboarding-edit-again">{t('common.edit')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-10" data-testid="personal-onboarding">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted"><Wallet className="h-5 w-5" /></span>
        <h1 className="text-xl font-bold tracking-tight">{isEdit ? t('onboarding.titleEdit') : t('onboarding.titleNew')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.subtitle')}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label>{t('onboarding.currency')}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger data-testid="onboarding-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{t(f.labelKey)}</Label>
            <Input
              id={f.key} data-testid={`onboarding-${f.key}`} inputMode="numeric" placeholder="0"
              value={values[f.key] || ''} onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            />
            {f.hintKey && <p className="text-[11px] text-muted-foreground">{t(f.hintKey)}</p>}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="goal">{t('onboarding.goalLabel')} <span className="text-muted-foreground">{t('onboarding.optional')}</span></Label>
          <Input id="goal" data-testid="onboarding-goal" placeholder={t('onboarding.goalPlaceholder')} maxLength={120} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <Button className="w-full" size="lg" onClick={submit} disabled={submitting} data-testid="onboarding-submit">
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {isEdit ? t('onboarding.saveChanges') : t('onboarding.seePicture')}
        </Button>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> {t('onboarding.privacy')}</p>
      </div>
    </div>
  );
}
