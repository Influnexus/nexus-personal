import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { llm } from '@/lib/ai/provider';
import Papa from 'papaparse';

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

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0 && parsed.data.length === 0) return NextResponse.json({ error: 'CSV parse failed' }, { status: 400 });

  const dateKey = (r: any) => Object.keys(r).find(k => /^date|posted|transaction/i.test(k)) || 'date';
  const descKey = (r: any) => Object.keys(r).find(k => /desc|memo|narration/i.test(k)) || 'description';
  const vendKey = (r: any) => Object.keys(r).find(k => /vendor|merchant|payee|name/i.test(k)) || '';
  const amtKey = (r: any) => Object.keys(r).find(k => /^amount|amt|value/i.test(k)) || 'amount';

  const rows: NormalizedRow[] = [];
  for (const r of parsed.data) {
    const date = toIso(r[dateKey(r)] || ''); if (!date) continue;
    const description = (r[descKey(r)] || '').trim();
    const vendor = (vendKey(r) ? r[vendKey(r)] : description.split(/[\s\-]+/)[0] || 'Unknown').trim();
    const raw = (r[amtKey(r)] || '0').toString().replace(/[,$\s]/g, '');
    const amount = parseFloat(raw); if (isNaN(amount)) continue;
    rows.push({ date, description, vendor, amount });
  }
  if (rows.length === 0) return NextResponse.json({ error: 'No valid rows' }, { status: 400 });

  // Batch categorize (limit batches of 25)
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH).map(r => ({ description: r.description, vendor: r.vendor || '', amount: r.amount }));
    try {
      const cats = await categorizeBatch(slice);
      slice.forEach((_, idx) => {
        const c = cats[idx];
        if (c) {
          rows[i + idx].category = c.category || 'Other';
          if (c.vendor) rows[i + idx].vendor = c.vendor;
        } else { rows[i + idx].category = 'Other'; }
      });
    } catch { slice.forEach((_, idx) => { rows[i + idx].category = 'Other'; }); }
  }

  const inserted = await transactionsRepo.insertMany(rows.map(r => ({
    organizationId: orgId,
    date: r.date,
    description: r.description,
    vendor: r.vendor || 'Unknown',
    category: r.category || 'Other',
    amount: r.amount,
    currency: 'USD',
    source: 'csv' as const,
  })));
  return NextResponse.json({ imported: inserted });
}
