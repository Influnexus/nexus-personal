'use client';
import { useState, useRef } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Loader2, BarChart3 } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function TransactionsPage() {
  const { data, mutate, isLoading } = useSWR('/api/cfo/transactions', fetcher);
  const txs = data?.transactions || [];
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/cfo/transactions', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Import failed'); return; }
      toast.success(`Imported ${d.imported} transactions — AI categorized.`);
      mutate();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const inflow = txs.filter((t: any) => t.amount > 0).reduce((s: number, t: any) => s + t.amount, 0);
  const outflow = -txs.filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + t.amount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Transactions</h1><p className="text-sm text-muted-foreground">Upload a CSV — AI will categorize and detect recurring vendors.</p></div>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="mr-2 h-4 w-4" /> Import CSV</>}
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile label="Total transactions" value={txs.length} />
        <Tile label="Inflow" value={`$${Math.round(inflow).toLocaleString()}`} tone="good" />
        <Tile label="Outflow" value={`$${Math.round(outflow).toLocaleString()}`} tone="bad" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent transactions</CardTitle><CardDescription>Latest 200 entries</CardDescription></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading…</div> : txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">Import a CSV to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Vendor</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {txs.slice(0, 200).map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{t.date}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{t.description}</TableCell>
                    <TableCell>{t.vendor}</TableCell>
                    <TableCell><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{t.category}</span></TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${t.amount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{t.amount >= 0 ? '+' : ''}${Math.round(t.amount).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: any; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : '';
  return <Card><CardContent className="p-5"><div className="text-xs font-medium text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div></CardContent></Card>;
}
