// Money formatting for Nexus Personal — pure helper, safe on server and client.
export function fmtMoney(amount: number, currency = 'INR'): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `${currency} ${Math.round(amount || 0).toLocaleString()}`;
  }
}

/** Compact form: ₹6.5L / ₹1.2Cr for INR, $1.2M style otherwise. Used for large positions. */
export function fmtMoneyCompact(amount: number, currency = 'INR'): string {
  const abs = Math.abs(amount || 0);
  const sign = amount < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1).replace(/\.0$/, '')}L`;
    if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${sign}₹${Math.round(abs)}`;
  }
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `;
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}${sym}${Math.round(abs)}`;
}
