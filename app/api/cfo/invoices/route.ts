import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { invoicesRepo } from '@/lib/repositories/invoices';
import { llm } from '@/lib/ai/provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId; if (!orgId) return NextResponse.json({ invoices: [] });
  const invoices = await invoicesRepo.listByOrg(orgId);
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.user.activeOrgId;
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File is too large (max 15MB). Please upload a smaller file.' }, { status: 400 });

  const mime = file.type || 'application/pdf';
  const SUPPORTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  const isHeic = /heic|heif/i.test(mime) || /\.(heic|heif)$/i.test(file.name || '');
  if (isHeic) {
    return NextResponse.json({ error: 'HEIC/HEIF photos aren\u2019t supported yet \u2014 please convert to JPG or PNG (most phones can do this from the Share menu) and try again.' }, { status: 400 });
  }
  if (!SUPPORTED.includes(mime)) {
    return NextResponse.json({ error: `Unsupported file type "${mime || 'unknown'}". Please upload a PDF, PNG or JPG.` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  const system = `You are an expert invoice parser. Extract structured fields from the attached invoice document. Output ONLY valid JSON matching this schema (no markdown, no commentary, no code fences):
{
  "vendor": string,
  "invoiceNumber": string|null,
  "invoiceDate": "YYYY-MM-DD"|null,
  "dueDate": "YYYY-MM-DD"|null,
  "amount": number,
  "currency": string,
  "tax": number|null,
  "lineItems": [ { "description": string, "quantity": number|null, "unitPrice": number|null, "amount": number } ],
  "anomalies": string[]
}
"anomalies" should list any missing required fields, unusual values, or suspicious patterns you notice (e.g. "missing due date", "amount mismatch with line items"). If you can't read the document, return {"error":"unreadable"}.`;

  // Strip markdown code fences some models wrap JSON in (```json ... ```) before parsing.
  function extractJson(raw: string): string {
    const trimmed = (raw || '').trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    return trimmed;
  }

  let parsed: any = null;
  try {
    const res = await llm.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: 'Extract the invoice fields from this document.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] as any },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 2000,
    });
    parsed = JSON.parse(extractJson(res.content || '{}'));
  } catch (e: any) {
    return NextResponse.json({ error: 'We couldn\u2019t read this document. Please try a clearer photo/scan or a different file.' }, { status: 500 });
  }
  if (parsed?.error) return NextResponse.json({ error: 'We couldn\u2019t extract data from this file \u2014 please try a clearer photo or scan.' }, { status: 400 });

  // Duplicate check
  if (parsed.vendor && parsed.invoiceNumber) {
    const dup = await invoicesRepo.findByVendorAndNumber(orgId, parsed.vendor, parsed.invoiceNumber);
    if (dup) parsed.anomalies = [...(parsed.anomalies || []), `Duplicate of existing invoice ${dup.invoiceNumber}`];
  }

  const inv = await invoicesRepo.create({
    organizationId: orgId,
    vendor: parsed.vendor || 'Unknown',
    invoiceNumber: parsed.invoiceNumber || null,
    invoiceDate: parsed.invoiceDate || null,
    dueDate: parsed.dueDate || null,
    amount: Number(parsed.amount) || 0,
    currency: parsed.currency || 'USD',
    tax: parsed.tax ?? null,
    lineItems: parsed.lineItems || [],
    status: 'open',
    direction: 'payable',
    source: 'upload',
    fileMime: mime,
    anomalies: parsed.anomalies || [],
    uploadedBy: session.user.id,
  });

  return NextResponse.json({ invoice: inv });
}
