// Founder/admin gate for the private analytics view. Emails are configured via the
// FOUNDER_EMAILS env var (comma-separated) — never exposed to the client bundle.
export function isFounderEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.FOUNDER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
