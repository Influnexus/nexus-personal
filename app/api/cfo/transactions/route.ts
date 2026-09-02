import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { llm } from '@/lib/ai/provider';
import { usageService } from '@/lib/billing/usage.service';
import Papa from 'papaparse';
import { briefingCache } from '@/lib/ai/briefing-cache';
import { trackServer } from '@/lib/analytics/track-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId; if (!orgId) return NextResponse.json({ transactions: [] });
  const txs = await transactionsRepo.listByOrg(orgId);
  return NextResponse.json({ transactions: txs });
}

interface NormalizedRow { date: string; description: string; vendor?: string; amount: number; category?: string }

function toIso(s: string): string | null {
  const d = new Date(s); if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function categorizeBatch(rows: { description: string; vendor: string; amount: number }[]) {
  if (rows.length === 0) return [] as { category: string; vendor: string }[];
  const sys = `You categorize accounting transactions. Reply with JSON only: {"items":[{"category":string,"vendor":string}]} in the same order. Categories: Revenue, Payroll, SaaS, Infrastructure, Marketing, Travel & Meals, Office, Payment fees, Professional Services, Taxes, Other.`;
  const userMsg = `Categorize:\n` + rows.map((r, i) => `${i + 1}. amount=${r.amount} desc="${r.description}" vendor="${r.vendor}"`).join('\n');
  const res = await llm.complete({
    messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
    response_format: { type: 'json_object' }, temperature: 0, max_tokens: 1500,
  });
  try { const j = JSON.parse(res.content || '{}'); return j.items || []; } catch { return []; }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId; if (!orgId) return NextResponse.json({ error: 'No active org' }, { status: 400 });

  const entitlement = await usageService.checkEntitlement(orgId, 'csv_imports');
  if (!entitlement.allowed) return NextResponse.json({ error: 'usage_limit', message: entitlement.reason }, { status: 402 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

  // Analytics: import lifecycle (event + coarse failure reason only — row data never logged).
  const track = (event: 'csv_import_started' | 'csv_import_completed' | 'csv_import_failed', reason?: string) =>
    trackServer(event, { userId: session.user.id, organizationId: orgId, isDemo: session.user.isDemo, meta: reason ? { reason } : undefined });
  track('csv_import_started');

  if (!/\.csv$/i.test(file.name) && file.type && !/csv|text\/plain/i.test(file.type)) {
    track('csv_import_failed', 'unsupported_type');
    return NextResponse.json({ error: 'Please upload a .csv file. Other formats are not supported yet.' }, { status: 400 });
  }
  const text = await file.text();
  if (!text.trim()) { track('csv_import_failed', 'empty_file'); return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 }); }
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.data.length === 0) { track('csv_import_failed', 'parse_failed'); return NextResponse.json({ error: 'CSV parse failed — no rows found. Check the file has a header row (date, description, vendor, amount).' }, { status: 400 }); }

  const dateKey = (r: any) => Object.keys(r).find(k => /^date|posted|transaction/i.test(k)) || 'date';
  const descKey = (r: any) => Object.keys(r).find(k => /desc|memo|narration/i.test(k)) || 'description';
  const vendKey = (r: any) => Object.keys(r).find(k => /vendor|merchant|payee|name/i.test(k)) || '';
  const amtKey = (r: any) => Object.keys(r).find(k => /^amount|amt|value/i.test(k)) || 'amount';

  const rows: NormalizedRow[] = [];
  let invalidRows = 0;
  for (const r of parsed.data) {
    const date = toIso(r[dateKey(r)] || '');
    const rawAmt = (r[amtKey(r)] || '').toString().replace(/[,$\s]/g, '');
    const amount = parseFloat(rawAmt);
    if (!date || isNaN(amount)) { invalidRows += 1; continue; }
    const description = (r[descKey(r)] || '').trim();
    const vendor = (vendKey(r) ? r[vendKey(r)] : description.split(/[\s\-]+/)[0] || 'Unknown').trim();
    rows.push({ date, description, vendor, amount });
  }
  if (rows.length === 0) {
    track('csv_import_failed', 'no_valid_rows');
    return NextResponse.json({ error: `No valid rows found (${invalidRows} row(s) skipped — check date and amount columns).` }, { status: 400 });
  }

  // Duplicate detection against existing transactions (same date + vendor + amount).
  const existing = await transactionsRepo.listByOrg(orgId);
  const existingKeys = new Set(existing.map(t => `${t.date}|${(t.vendor || '').toLowerCase()}|${t.amount}`));
  const uniqueRows: NormalizedRow[] = [];
  let duplicateRows = 0;
  for (const r of rows) {
    const key = `${r.date}|${(r.vendor || '').toLowerCase()}|${r.amount}`;
    if (existingKeys.has(key)) { duplicateRows += 1; continue; }
    existingKeys.add(key); // also de-dupe within the same file
    uniqueRows.push(r);
  }

  // Batch categorize (limit batches of 25)
  const BATCH = 25;
  for (let i = 0; i < uniqueRows.length; i += BATCH) {
    const slice = uniqueRows.slice(i, i + BATCH).map(r => ({ description: r.description, vendor: r.vendor || '', amount: r.amount }));
    try {
      const cats = await categorizeBatch(slice);
      slice.forEach((_, idx) => {
        const c = cats[idx];
        if (c) {
          uniqueRows[i + idx].category = c.category || 'Other';
          if (c.vendor) uniqueRows[i + idx].vendor = c.vendor;
        } else { uniqueRows[i + idx].category = 'Other'; }
      });
    } catch { slice.forEach((_, idx) => { uniqueRows[i + idx].category = 'Other'; }); }
  }

  const inserted = uniqueRows.length > 0 ? await transactionsRepo.insertMany(uniqueRows.map(r => ({
    organizationId: orgId,
    date: r.date,
    description: r.description,
    vendor: r.vendor || 'Unknown',
    category: r.category || 'Other',
    amount: r.amount,
    currency: 'USD',
    source: 'csv' as const,
  }))) : 0;

  usageService.record(orgId, 'csv_imports').catch(() => {});
  briefingCache.invalidate(orgId);
  track('csv_import_completed');
  return NextResponse.json({
    imported: inserted,
    skipped: invalidRows,
    duplicates: duplicateRows,
    totalRows: parsed.data.length,
  });
}
