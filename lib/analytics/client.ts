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

export function track(event: string, meta?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  try {
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
