// Tool result cache — keyed by (orgId, toolName, argsJson). TTL 60s. Used so that a retried
// agent run reuses expensive tool outputs instead of rerunning every tool.
interface Entry { at: number; value: any }
const CACHE = new Map<string, Entry>();
const TTL_MS = 60_000;

function key(orgId: string, name: string, args: string) { return `${orgId}::${name}::${args || '{}'}`; }

export const toolCache = {
  get(orgId: string, name: string, args: string): any | undefined {
    const e = CACHE.get(key(orgId, name, args));
    if (!e) return undefined;
    if (Date.now() - e.at > TTL_MS) { CACHE.delete(key(orgId, name, args)); return undefined; }
    return e.value;
  },
  set(orgId: string, name: string, args: string, value: any) {
    CACHE.set(key(orgId, name, args), { at: Date.now(), value });
    // Bound size
    if (CACHE.size > 2000) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 500);
      for (const [k] of oldest) CACHE.delete(k);
    }
  },
  clearOrg(orgId: string) {
    for (const k of CACHE.keys()) if (k.startsWith(orgId + '::')) CACHE.delete(k);
  },
};
