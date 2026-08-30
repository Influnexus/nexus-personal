// Sprint 6 — Customer Validation Analytics: event whitelist + metadata sanitization.
// PRIVACY BY DESIGN: only events in ALLOWED_EVENTS are accepted, and only whitelisted,
// length-capped metadata keys are stored. No financial figures, invoice contents, chat
// contents, emails, names, passwords or free text can ever enter the analytics store.

export const ALLOWED_EVENTS = [
  // Acquisition
  'landing_page_visit', 'signup_page_viewed',
  // Onboarding / conversion
  'demo_started', 'demo_converted', 'signup_completed', 'trial_started',
  // Activation & AI usage
  'dashboard_viewed', 'cfo_chat_viewed', 'cfo_question', 'cfo_response_completed', 'cfo_response_failed',
  // Data features
  'invoice_upload_started', 'invoice_upload_completed', 'invoice_upload_failed',
  'csv_import_started', 'csv_import_completed', 'csv_import_failed',
  // Insight features
  'report_generated', 'report_failed', 'reports_page_viewed', 'forecast_viewed',
  'memory_page_viewed', 'memory_used',
  // Monetization
  'billing_page_viewed',
  // Nexus Personal (Sprint P2) — events only, never financial values
  'personal_onboarding_started', 'personal_onboarding_completed', 'personal_demo_started',
  'personal_dashboard_viewed', 'personal_health_viewed', 'personal_resilience_viewed',
  'personal_transaction_imported',
  // Nexus Personal (Sprint P3) — forecast & alerts, no financial values
  'personal_forecast_viewed', 'personal_alerts_viewed', 'personal_alert_opened',
  'personal_forecast_interaction',
  // Nexus Personal (Sprint P4) — scenarios, no financial values
  'personal_scenario_started', 'personal_scenario_completed',
  'personal_scenario_type', 'personal_scenario_alternative_selected',
  // Nexus Personal (Sprint P5) — chat, no financial values or message text
  'personal_chat_started', 'personal_chat_question', 'personal_chat_scenario',
  'personal_chat_tool_used', 'personal_chat_completed',
  // Engagement / meta
  'session_heartbeat', 'feedback_submitted', 'problem_reported',
] as const;

export type AnalyticsEvent = (typeof ALLOWED_EVENTS)[number];

const eventSet = new Set<string>(ALLOWED_EVENTS);
export const isAllowedEvent = (e: string): e is AnalyticsEvent => eventSet.has(e);

// Coarse metadata only. 'reason' is a short machine code (e.g. 'unsupported_type'), never user text.
const META_KEYS = ['status', 'feature', 'reason', 'errorId', 'durationSec', 'first'] as const;

export function sanitizeMeta(meta: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!meta || typeof meta !== 'object') return out;
  const m = meta as Record<string, unknown>;
  for (const k of META_KEYS) {
    const v = m[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && isFinite(v)) out[k] = Math.round(v);
    else if (typeof v === 'string') out[k] = v.slice(0, 80).replace(/[\r\n]/g, ' ');
  }
  return out;
}

// IDs coming from the client (visitor/session) are opaque tokens we generate ourselves —
// still, normalize defensively so nothing weird can be persisted.
export function sanitizeId(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const clean = v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return clean || null;
}

export function sanitizePage(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  // Store pathname only — never query strings (could contain tokens) or full URLs.
  const path = v.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) return null;
  return path.slice(0, 100);
}
