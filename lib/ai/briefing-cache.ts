// Briefing narrative cache — the AI-generated executive summary text is the expensive part of
// GET /api/cfo/briefing (multi-second LLM call); KPIs/health/forecast are cheap DB computations
// and always stay fresh. Caching just the narrative text turns repeat dashboard visits from ~7s
// into <100ms while still auto-invalidating the moment new data (invoice/CSV) is uploaded, so the
// dashboard never shows a narrative that's meaningfully stale.
interface Entry { at: number; text: string; aiAvailable: boolean }
const CACHE = new Map<string, Entry>();
const TTL_MS = 10 * 60_000; // 10 minutes

export const briefingCache = {
  get(orgId: string): Entry | undefined {
    const e = CACHE.get(orgId);
    if (!e) return undefined;
    if (Date.now() - e.at > TTL_MS) { CACHE.delete(orgId); return undefined; }
    return e;
  },
  set(orgId: string, text: string, aiAvailable: boolean) {
    CACHE.set(orgId, { at: Date.now(), text, aiAvailable });
  },
  invalidate(orgId: string) {
    CACHE.delete(orgId);
  },
};
