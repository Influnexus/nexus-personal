// Lightweight in-memory rate limiter (no Redis dependency — this app runs as a single persistent
// Node process via `next start`, so an in-memory token-bucket-per-key is safe and simple). Used to
// protect expensive/abusable endpoints: auth, demo creation, AI chat, billing checkout, uploads.
// NOTE: resets on server restart and does not share state across multiple instances — acceptable
// for this deployment model (single container). If scaled horizontally later, swap for Redis.

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map doesn't grow unbounded over a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key);
}, 5 * 60_000);

export interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number }

/**
 * @param key Unique key for this limit bucket, e.g. `register:${ip}` or `chat:${orgId}`.
 * @param limit Max requests allowed within the window.
 * @param windowMs Window size in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Best-effort client IP extraction behind proxies/load balancers. */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
