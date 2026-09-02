// Sprint P2 — Personal transactions. REUSES the existing transaction repository (no second
// architecture) with the PERSONAL category taxonomy. Enterprise /api/cfo/transactions is
// deliberately untouched — this is a sibling route scoped to the user's personal workspace.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import Papa from 'papaparse';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { personalService } from '@/lib/services/personal.service';
import { llm } from '@/lib/ai/provider';
import { PERSONAL_CATEGORIES } from '@/lib/core/finance';
import { trackServer } from '@/lib/analytics/track-server';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) return NextResponse.json({ transactions: [], workspace: null });
  const txs = await transactionsRepo.listByOrg(ws.id);
  return NextResponse.json({
    workspace: { id: ws.id, name: ws.name },
    currency: ws.personalProfile?.currency || 'INR',
    transactions: txs.map(t => ({ id: t.id, date: t.date, description: t.description, vendor: t.vendor, category: t.category, amount: t.amount })),
  });
}

// Keyword fallback so imports NEVER fail if the LLM is unavailable — deterministic mapping.
function heuristicCategory(desc: string, vendor: string, amount: number): string {
  const s = `${desc} ${vendor}`.toLowerCase();
  if (amount > 0) return /refund|cashback/.test(s) ? 'Other' : 'Income';
  if (/rent|lease|maintenance|society/.test(s)) return 'Housing';
  if (/grocer|mart|fresh|bazaar|kirana|supermar/.test(s)) return 'Groceries';
  if (/electric|water bill|internet|broadband|wifi|gas bill|utility|dth|recharge/.test(s)) return 'Utilities';
  if (/uber|ola|fuel|petrol|diesel|metro|cab|taxi|bus|train|parking/.test(s)) return 'Transportation';
  if (/restaurant|dining|zomato|swiggy|cafe|coffee|pizza|food/.test(s)) return 'Dining';
  if (/netflix|spotify|prime|hotstar|subscription|membership/.test(s)) return 'Subscriptions';
  if (/hospital|pharma|clinic|doctor|medic|gym|fitness/.test(s)) return 'Health';
  if (/insurance|premium|policy/.test(s)) return 'Insurance';
  if (/emi|loan|credit card payment|repayment/.test(s)) return 'Debt';
  if (/movie|cinema|game|concert|event/.test(s)) return 'Entertainment';
  if (/amazon|flipkart|myntra|mall|store|shopping/.test(s)) return 'Shopping';
  if (/sip|mutual fund|invest|stock|zerodha|groww|etf|fd |deposit/.test(s)) return 'Investments';
  return 'Other';
}

async function categorizePersonalBatch(rows: { description: string; vendor: string; amount: number }[]) {
  if (rows.length === 0) return [] as { category: string }[];
  const sys = `You categorize PERSONAL finance transactions. Reply with JSON only: {"items":[{"category":string}]} in the same order. Categories: ${PERSONAL_CATEGORIES.join(', ')}. Positive amounts are usually Income.`;
  const userMsg = 'Categorize:\n' + rows.map((r, i) => `${i + 1}. amount=${r.amount} desc="${r.description}" vendor="${r.vendor}"`).join('\n');
  const res = await llm.complete({
    messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
    response_format: { type: 'json_object' }, temperature: 0, max_tokens: 1200,
  });
  try { const j = JSON.parse(res.content || '{}'); return j.items || []; } catch { return []; }
}

function toIso(s: string): string | null {
  const d = new Date(s); if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ws = await personalService.findWorkspaceForUser(session.user.id);
  if (!ws) return NextResponse.json({ error: 'No personal workspace yet — complete onboarding first.' }, { status: 400 });

  const rl = rateLimit(`personal-csv:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many imports — please try again later.' }, { status: 429 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!/\.csv$/i.test(file.name) && file.type && !/csv|text\/plain/i.test(file.type)) {
    return NextResponse.json({ error: 'Please upload a .csv file.' }, { status: 400 });
  }
  const text = await file.text();
  if (!text.trim()) return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.data.length === 0) return NextResponse.json({ error: 'CSV parse failed — no rows found. Include a header row (date, description, amount).' }, { status: 400 });

  const dateKey = (r: any) => Object.keys(r).find(k => /^date|posted|transaction/i.test(k)) || 'date';
  const descKey = (r: any) => Object.keys(r).find(k => /desc|memo|narration/i.test(k)) || 'description';
  const vendKey = (r: any) => Object.keys(r).find(k => /vendor|merchant|payee|name/i.test(k)) || '';
  const amtKey = (r: any) => Object.keys(r).find(k => /^amount|amt|value|debit|credit/i.test(k)) || 'amount';

  const rows: { date: string; description: string; vendor: string; amount: number; category?: string }[] = [];
  let invalidRows = 0;
  for (const r of parsed.data) {
    const date = toIso(r[dateKey(r)] || '');
    const amount = parseFloat((r[amtKey(r)] || '').toString().replace(/[,₹$\s]/g, ''));
    if (!date || isNaN(amount)) { invalidRows += 1; continue; }
    const description = (r[descKey(r)] || '').trim();
    const vendor = (vendKey(r) ? r[vendKey(r)] : description.split(/[\s\-]+/)[0] || 'Unknown').trim();
    rows.push({ date, description, vendor, amount });
  }
  if (rows.length === 0) return NextResponse.json({ error: `No valid rows found (${invalidRows} skipped — check date and amount columns).` }, { status: 400 });

  // Duplicate detection (same date + vendor + amount), consistent with the Enterprise importer.
  const existing = await transactionsRepo.listByOrg(ws.id);
  const keys = new Set(existing.map(t => `${t.date}|${(t.vendor || '').toLowerCase()}|${t.amount}`));
  const unique: typeof rows = [];
  let duplicates = 0;
  for (const r of rows) {
    const k = `${r.date}|${r.vendor.toLowerCase()}|${r.amount}`;
    if (keys.has(k)) { duplicates += 1; continue; }
    keys.add(k); unique.push(r);
  }

  // Categorize with the PERSONAL taxonomy (LLM batch → heuristic fallback, then final whitelist guard).
  const BATCH = 25;
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    let cats: { category?: string }[] = [];
    try { cats = await categorizePersonalBatch(slice.map(r => ({ description: r.description, vendor: r.vendor, amount: r.amount }))); } catch { cats = []; }
    slice.forEach((r, idx) => {
      const suggested = cats[idx]?.category;
      const cat = suggested && (PERSONAL_CATEGORIES as readonly string[]).includes(suggested) ? suggested : heuristicCategory(r.description, r.vendor, r.amount);
      unique[i + idx].category = cat;
    });
  }

  const currency = ws.personalProfile?.currency || 'INR';
  const inserted = unique.length > 0 ? await transactionsRepo.insertMany(unique.map(r => ({
    organizationId: ws.id,
    date: r.date,
    description: r.description,
    vendor: r.vendor || 'Unknown',
    category: r.category || 'Other',
    amount: r.amount,
    currency,
    source: 'csv' as const,
  }))) : 0;

  trackServer('personal_transaction_imported', { userId: session.user.id, organizationId: ws.id, isDemo: session.user.isDemo, meta: { status: 'completed' } });
  return NextResponse.json({ imported: inserted, duplicates, skipped: invalidRows, totalRows: parsed.data.length });
}
