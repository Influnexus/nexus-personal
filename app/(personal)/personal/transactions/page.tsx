'use client';
// Personal transactions (P2.3) — same transaction architecture as Enterprise, personal taxonomy.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/personal/format';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function PersonalTransactionsPage() {
  const [txs, setTxs] = useState<any[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/personal/transactions');
      const j = await res.json();
      setTxs(j.transactions || []);
      if (j.currency) setCurrency(j.currency);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/personal/transactions', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Import failed.'); return; }
      toast.success(`Imported ${j.imported} transaction(s)${j.duplicates ? ` · ${j.duplicates} duplicate(s) skipped` : ''}.`);
      await load();
    } catch { toast.error('Import failed.'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="space-y-5 pt-8" data-testid="personal-transactions">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">Your money activity — categorized for you.</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid="personal-csv-input" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="personal-csv-button">
          {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} Import CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : txs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet. Import a CSV (date, description, amount) to get started.</p>
        ) : (
          <div className="max-h-[65vh] divide-y divide-border overflow-y-auto">
            {txs.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{t.date}</span>
                <span className="min-w-0 flex-1 truncate">{t.description || t.vendor}</span>
                <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">{t.category}</span>
                <span className={`w-28 shrink-0 text-right tabular-nums ${t.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {t.amount > 0 ? '+' : ''}{fmtMoney(t.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">CSV import only — Nexus never asks for bank logins or passwords.</p>
    </div>
  );
}
