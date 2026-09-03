'use client';
// Financial Health detail — calm dialog with the transparent factor model (P2.5).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/client';
import { ChevronRight } from 'lucide-react';
import { useT } from '@/components/personal/i18n-provider';

const STATUS_STYLE: Record<string, string> = {
  strong: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  moderate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  weak: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export function HealthCard({ health }: { health: any }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const bandLabel = t('health.band.' + health.band);
  return (
    <>
      <button
        data-testid="personal-health-card"
        onClick={() => { setOpen(true); track('personal_health_viewed'); }}
        className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left transition-shadow hover:shadow-md"
      >
        <span className="text-xs font-medium text-muted-foreground">{t('health.title')}</span>
        <span className="mt-1.5 text-3xl font-bold tabular-nums">{health.score}<span className="text-base font-normal text-muted-foreground"> {t('health.of100')}</span></span>
        <span className="mt-1 flex items-center text-sm text-muted-foreground">{bandLabel}<ChevronRight className="ml-0.5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="personal-health-dialog">
          <DialogHeader>
            <DialogTitle>{t('health.dialogTitle', { score: health.score })}</DialogTitle>
            <DialogDescription>{t('health.dialogDesc', { band: bandLabel })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {health.factors.map((f: any) => (
              <div key={f.key} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.note}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[f.status]}`}>{t('health.status.' + f.status)}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">{health.disclaimer}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
