// Client-side analytics helper. Mints an anonymous visitor id (localStorage) and a per-tab
// session id (sessionStorage), then fires whitelisted events to /api/analytics/track.
// Fire-and-forget: failures are silently ignored so analytics never affects UX.

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let v = localStorage.getItem('nx_vid');
    if (!v) { v = randomId(); localStorage.setItem('nx_vid', v); }
    return v;
  } catch { return null; }
}

export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let s = sessionStorage.getItem('nx_sid');
    if (!s) { s = randomId(); sessionStorage.setItem('nx_sid', s); sessionStorage.setItem('nx_sid_start', String(Date.now())); }
    return s;
  } catch { return null; }
}

export function getSessionStart(): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = sessionStorage.getItem('nx_sid_start');
    return raw ? Number(raw) : Date.now();
  } catch { return Date.now(); }
}

// Duplicate-event guard. The first page load can evaluate this module twice (hydration
// remounts / duplicated chunk instances / rapid double document load), so an in-memory
// variable alone is not enough — sessionStorage is synchronous and shared across all
// module copies and reloads within the same tab, making the guard bulletproof.
let lastKeyMem = '';
let lastAtMem = 0;
const DEDUPE_WINDOW_MS = 2000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  if (key === lastKeyMem && now - lastAtMem < DEDUPE_WINDOW_MS) return true;
  try {
    const raw = sessionStorage.getItem('nx_last_evt');
    if (raw) {
      const sep = raw.lastIndexOf('|');
      if (sep > 0 && raw.slice(0, sep) === key && now - Number(raw.slice(sep + 1)) < DEDUPE_WINDOW_MS) return true;
    }
    sessionStorage.setItem('nx_last_evt', `${key}|${now}`);
  } catch { /* storage unavailable — fall back to in-memory guard only */ }
  lastKeyMem = key;
  lastAtMem = now;
  return false;
}

export function track(event: string, meta?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  try {
    if (isDuplicate(`${event}:${window.location.pathname}`)) return;
    const body = JSON.stringify({
      event,
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      page: window.location.pathname,
      meta: meta || {},
    });
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true, // survives page navigations/unloads
    }).catch(() => {});
  } catch { /* never throw from analytics */ }
}
