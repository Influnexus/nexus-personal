'use client';
// Financial Resilience detail (P2.6) — "how long could you maintain your essential lifestyle?"
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/client';
import { fmtMoney } from '@/lib/personal/format';
import { ChevronRight, ShieldCheck } from 'lucide-react';

export function ResilienceCard({ resilience, currency }: { resilience: any; currency: string }) {
  const [open, setOpen] = useState(false);
  const months = resilience.resilienceMonths;
  const rows = [
    { label: 'Liquid reserve', value: fmtMoney(resilience.liquidReserve, currency), note: 'Cash and savings available today' },
    { label: 'Essential monthly spending', value: fmtMoney(resilience.essentialMonthly, currency), note: 'Housing, groceries, utilities, transport, insurance, health' },
    { label: 'Fixed commitments', value: `${fmtMoney(resilience.fixedMonthlyCommitments, currency)}/mo`, note: 'Recurring essential bills detected in your activity' },
    { label: 'Debt payments', value: `${fmtMoney(resilience.debtMonthly, currency)}/mo`, note: 'Ongoing loan and EMI obligations' },
  ];
  return (
    <>
      <button
        data-testid="personal-resilience-card"
        onClick={() => { setOpen(true); track('personal_resilience_viewed'); }}
        className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left transition-shadow hover:shadow-md"
      >
        <span className="text-xs font-medium text-muted-foreground">Financial Resilience</span>
        <span className="mt-1.5 text-3xl font-bold tabular-nums">{months}<span className="text-base font-normal text-muted-foreground"> months</span></span>
        <span className="mt-1 flex items-center text-sm text-muted-foreground">if income stopped today<ChevronRight className="ml-0.5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="personal-resilience-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Resilience · {months} months</DialogTitle>
            <DialogDescription>{resilience.definition}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.note}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">Calculated from your reserve ÷ essential monthly spending. Deterministic — no AI involved.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
