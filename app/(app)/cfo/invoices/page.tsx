'use client';
import { useState, useRef } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Loader2, AlertTriangle, FileText, Receipt } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function InvoicesPage() {
  const { data, mutate, isLoading } = useSWR('/api/cfo/invoices', fetcher);
  const inv = data?.invoices || [];
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/cfo/invoices', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Extraction failed'); return; }
      const anomalies = d.invoice?.anomalies || [];
      if (anomalies.length > 0) toast.warning(`Invoice extracted with ${anomalies.length} anomaly note(s)`);
      else toast.success(`Extracted invoice from ${d.invoice.vendor}`);
      mutate();
    } catch (err: any) { toast.error(err.message || 'Upload failed'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const total = inv.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const overdue = inv.filter((i: any) => i.status === 'overdue').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Invoices</h1><p className="text-sm text-muted-foreground">Upload PDFs or images — AI extracts vendor, amounts, line items, and anomalies.</p></div>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting…</> : <><Upload className="mr-2 h-4 w-4" /> Upload invoice</>}
        </Button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label="Total invoices" value={inv.length} />
        <StatTile label="Total amount" value={`$${Math.round(total).toLocaleString()}`} />
        <StatTile label="Overdue" value={overdue} tone={overdue > 0 ? 'warn' : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All invoices</CardTitle><CardDescription>Sorted by most recent</CardDescription></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading…</div> : inv.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No invoices yet</p>
              <p className="text-sm text-muted-foreground">Upload a PDF or image to extract structured data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead><TableHead>Invoice #</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {i.vendor}</div></TableCell>
                    <TableCell className="text-muted-foreground">{i.invoiceNumber || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{i.dueDate || '—'}</TableCell>
                    <TableCell><StatusBadge status={i.status} direction={i.direction} /></TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{i.currency || '$'} {Number(i.amount || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      {(i.anomalies && i.anomalies.length > 0) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> {i.anomalies.length}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
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

function StatTile({ label, value, tone }: { label: string; value: any; tone?: 'warn' }) {
  return (
    <Card>
      <CardContent className="p-5"><div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
function StatusBadge({ status, direction }: { status: string; direction?: string }) {
  const map: Record<string, string> = {
    overdue: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    draft: 'bg-muted text-muted-foreground',
    void: 'bg-muted text-muted-foreground line-through',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${map[status] || 'bg-muted'}`}>{status}{direction === 'payable' && ' · AP'}</span>;
}
