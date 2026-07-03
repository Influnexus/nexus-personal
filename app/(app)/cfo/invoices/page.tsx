'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Loader2, AlertTriangle, FileText, Receipt, Check, X, ClipboardPaste } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

interface UploadJob { id: string; name: string; status: 'uploading' | 'done' | 'error'; message?: string }

export default function InvoicesPage() {
  const { data, mutate, isLoading } = useSWR('/api/cfo/invoices', fetcher);
  const inv = data?.invoices || [];
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = jobs.some(j => j.status === 'uploading');

  const uploadOne = useCallback(async (file: File) => {
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setJobs(prev => [...prev, { id, name: file.name, status: 'uploading' }]);
    try {
      if (file.size === 0) throw new Error('File is empty');
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
        throw new Error('HEIC photos aren\u2019t supported yet — convert to JPG/PNG first');
      }
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/cfo/invoices', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Extraction failed');
      const anomalies = d.invoice?.anomalies || [];
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'done', message: `Extracted ${d.invoice.vendor}` } : j));
      if (anomalies.length > 0) toast.warning(`${file.name}: extracted with ${anomalies.length} anomaly note(s)`);
      else toast.success(`Extracted invoice from ${d.invoice.vendor}`);
      mutate();
      globalMutate('/api/cfo/briefing'); // keep the Executive Dashboard in sync automatically
    } catch (err: any) {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'error', message: err.message || 'Upload failed' } : j));
      toast.error(`${file.name}: ${err.message || 'Upload failed'}`);
    }
  }, [mutate]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    // Upload sequentially so progress + toasts are legible for multiple invoices at once.
    for (const f of arr) await uploadOne(f);
  }, [uploadOne]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) await uploadFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Drag & drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  // Paste from clipboard (screenshot of an invoice, etc.)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items; if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
      }
      if (files.length > 0) { e.preventDefault(); uploadFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uploadFiles]);

  const total = inv.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const overdue = inv.filter((i: any) => i.status === 'overdue').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Invoices</h1><p className="text-sm text-muted-foreground">Upload PDFs or images — AI extracts vendor, amounts, line items, and anomalies.</p></div>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting…</> : <><Upload className="mr-2 h-4 w-4" /> Upload invoice(s)</>}
        </Button>
        <input ref={fileRef} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
      </div>

      {/* Drag & drop / paste zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn('flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          dragActive ? 'border-foreground/60 bg-foreground/[0.04]' : 'border-border/70 hover:border-foreground/30')}
      >
        <Receipt className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drag & drop invoices here</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ClipboardPaste className="h-3.5 w-3.5" /> or paste a screenshot (Ctrl/Cmd+V) — PDF, PNG, JPG supported, multiple at once</p>
      </div>

      {jobs.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            {jobs.slice().reverse().map(j => (
              <div key={j.id} className="flex items-center gap-2.5 text-sm">
                {j.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                {j.status === 'done' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                {j.status === 'error' && <X className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />}
                <span className="truncate font-medium">{j.name}</span>
                {j.message && <span className="truncate text-xs text-muted-foreground">— {j.message}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
