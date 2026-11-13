// Money is stored as whole cents. These helpers are plain JS so tests can import them directly.

/** "$3,500.50" or "3500.5" -> 350050. Empty -> null. Anything else -> NaN. */
export function parseDollarsToCents(input) {
  const s = String(input ?? '').trim().replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** 350050 -> "$3,500.50"; whole dollars drop the cents. null -> "Not set". */
export function formatCents(cents) {
  if (cents === null || cents === undefined) return 'Not set';
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** "15" or "15.5%" -> 15.5 within [0, 100]. Empty -> null. Invalid -> NaN. */
export function parsePercent(input) {
  const s = String(input ?? '').trim().replace(/%$/, '').trim();
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n <= 100 ? n : NaN;
}

/** "12" -> 12. Empty -> null. Negative, fractional or junk -> NaN. */
export function parseWholeNumber(input) {
  const s = String(input ?? '').trim().replace(/,/g, '');
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}
