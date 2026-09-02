// Sprint P4 — LLM-powered natural language → structured scenario levers.
// The LLM ONLY extracts parameters. It does NOT calculate financial consequences.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { llm } from '@/lib/ai/provider';
import { trackServer } from '@/lib/analytics/track-server';
import { personalService } from '@/lib/services/personal.service';

const SYSTEM_PROMPT = `You are a financial scenario parser for Nexus Personal.
Your ONLY job is to extract structured financial scenario parameters from the user's natural language input.
You MUST NOT calculate any financial consequences — that is done by a separate deterministic engine.

Return a JSON object with ONLY these fields (include only relevant ones):
{
  "incomeChangePct": number | null,           // e.g., -20 for 20% income drop, -100 for zero income
  "incomeChangeAbsolute": number | null,      // e.g., 10000 for ₹10K/mo more income
  "essentialChangePct": number | null,        // e.g., 15 for 15% essential spending increase
  "essentialChangeAbsolute": number | null,   // e.g., 18000 for ₹18K/mo more on essentials
  "discretionaryChangePct": number | null,
  "discretionaryChangeAbsolute": number | null,
  "oneTimePurchase": { "amount": number, "date": "YYYY-MM-DD" | null } | null,
  "newRecurringExpense": { "amount": number, "label": string } | null,
  "removeRecurringExpense": { "vendor": string } | null,
  "additionalSavings": number | null,
  "description": string,                      // short human summary of the scenario
  "ambiguous": boolean,                       // true if important values are missing
  "clarificationNeeded": string | null        // what to ask the user if ambiguous
}

RULES:
- All amounts should be in the same currency as the user mentions (default INR).
- For "buy X" or "purchase X" → use oneTimePurchase with the amount.
- For "move to ₹X rent" → use essentialChangeAbsolute with the DIFFERENCE (new - old). If you don't know old rent, set ambiguous=true.
- For "take N months off work" → use incomeChangePct=-100.
- For "start ₹X EMI/loan" → use newRecurringExpense.
- For "cancel X subscription" → use removeRecurringExpense.
- For "invest ₹X more" → use additionalSavings.
- For "salary increase of X%" → use incomeChangePct=X.
- Do NOT calculate consequences. Do NOT give advice. ONLY extract parameters.
- If amounts are in lakhs (L), convert: 1L = 100000, 2L = 200000, etc.
- If the request doesn't map to any supported lever, return null values and set ambiguous=true.
- Today's date is provided in the context.
`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const input = body.input?.trim();
    if (!input) return NextResponse.json({ error: 'No input provided' }, { status: 400 });

    const ws = await personalService.findWorkspaceForUser(session.user.id);
    const today = new Date().toISOString().slice(0, 10);

    // Provide context about current state (no raw numbers — just structure)
    const contextNote = ws?.personalProfile
      ? `User currency: ${ws.personalProfile.currency || 'INR'}. Today: ${today}.`
      : `Default currency: INR. Today: ${today}.`;

    const result = await llm.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${contextNote}\n\nUser says: "${input}"\n\nRespond with ONLY a valid JSON object. No markdown, no code fences.` },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    let parsed: any = {};
    try {
      // Handle potential markdown code fences in response
      let content = result.content || '{}';
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = { ambiguous: true, clarificationNeeded: 'Could not understand the request. Please try rephrasing or use the manual sliders.' };
    }

    // Privacy-safe analytics — only event type, no amounts
    trackServer('personal_scenario_started', {
      userId: session.user.id,
      organizationId: ws?.id,
      isDemo: !!ws?.isDemo,
      meta: {
        feature: parsed.oneTimePurchase ? 'purchase' :
                 parsed.incomeChangePct != null ? 'income' :
                 parsed.newRecurringExpense ? 'recurring' :
                 parsed.removeRecurringExpense ? 'cancel' : 'other',
      },
    });

    return NextResponse.json({ levers: parsed, raw: input });
  } catch (e: any) {
    console.error('[personal/scenarios/parse] Error:', e.message);
    return NextResponse.json({
      levers: { ambiguous: true, clarificationNeeded: 'AI is temporarily unavailable. Use the manual sliders instead.' },
      raw: '',
    });
  }
}
