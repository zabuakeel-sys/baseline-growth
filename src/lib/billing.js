// What each client owes us, month by month. Plain JS so tests can load it directly.
//
// The rules, in one place:
// - Monthly fee: billed every month from the contract start month through the end month (or
//   the current month). Optional; 0 for pure revenue-share deals.
// - Signup fee: billed once per customer we brought, in the month they became a customer.
// - Revenue share: share percent x what a customer we brought paid the client that month,
//   for share_months months starting with the month they became a customer (or for as long
//   as they stay, when share_months is empty). Billed only on revenue the client CONFIRMED;
//   unconfirmed revenue is shown as waiting, never billed.
// - Only months from the contract start month are billed.
// - A month is due on the 15th of the following month. Unpaid after that day = late.
// - All money is whole cents. Each customer's share is rounded to the nearest cent.

/** 'YYYY-MM-DD' -> 'YYYY-MM-01'. */
export const monthOf = (isoDate) => `${isoDate.slice(0, 7)}-01`;

/** 'YYYY-MM-01' plus n months. */
export function addMonths(month, n) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

/** Whole months from a to b, both 'YYYY-MM-01'. */
export const monthsBetween = (a, b) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));

/** The day a month's bill is due: the 15th of the next month. */
export const dueDateOf = (month) => `${addMonths(month, 1).slice(0, 8)}15`;

/** True when `month` falls inside the share window of a customer who started in `startMonth`. */
export function inShareWindow(startMonth, month, shareMonths) {
  const n = monthsBetween(startMonth, month);
  return n >= 0 && (shareMonths == null || n < shareMonths);
}

/** The share in cents of one customer's revenue. */
export const shareCents = (revenueCents, sharePercent) => Math.round((revenueCents * sharePercent) / 100);

/**
 * One client's statement.
 * client:    { monthly_fee_cents, share_percent, share_months, signup_fee_cents, contract_start, contract_end }
 * customers: [{ id, customer_since }]  customers we brought ('YYYY-MM-DD' they became a customer)
 * revenue:   [{ lead_id, month, revenue_cents, confirmed }]
 * payments:  [{ month, amount_cents }]
 * today:     'YYYY-MM-DD'
 * Returns rows oldest first: { month, feeCents, signupCents, signups, shareCents, waitingCents,
 * dueCents, paidCents, balanceCents, dueDate, status } where status is 'paid' | 'open' | 'late' | 'upcoming'.
 */
export function statement({ client, customers, revenue, payments, today }) {
  if (!client.contract_start) return [];
  const first = monthOf(client.contract_start);
  const thisMonth = monthOf(today);
  const lastByContract = client.contract_end ? monthOf(client.contract_end) : thisMonth;
  const last = lastByContract < thisMonth ? lastByContract : thisMonth;
  const startOf = new Map(customers.filter((c) => c.customer_since).map((c) => [c.id, monthOf(c.customer_since)]));

  const paidByMonth = new Map();
  for (const p of payments) {
    const m = monthOf(p.month);
    paidByMonth.set(m, (paidByMonth.get(m) ?? 0) + p.amount_cents);
  }

  const rows = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) {
    const signups = [...startOf.values()].filter((m) => m === month).length;
    const signupCents = signups * (client.signup_fee_cents || 0);
    let share = 0;
    let waiting = 0;
    for (const r of revenue) {
      if (monthOf(r.month) !== month) continue;
      const start = startOf.get(r.lead_id);
      if (!start || !inShareWindow(start, month, client.share_months)) continue;
      const cents = shareCents(r.revenue_cents, client.share_percent || 0);
      if (r.confirmed) share += cents;
      else waiting += cents;
    }
    const feeCents = client.monthly_fee_cents || 0;
    const dueCents = feeCents + signupCents + share;
    const paidCents = paidByMonth.get(month) ?? 0;
    const balanceCents = dueCents - paidCents;
    const dueDate = dueDateOf(month);
    let status;
    if (balanceCents <= 0) status = 'paid';
    else if (month === thisMonth) status = 'upcoming';
    else if (today > dueDate) status = 'late';
    else status = 'open';
    rows.push({ month, feeCents, signups, signupCents, shareCents: share, waitingCents: waiting, dueCents, paidCents, balanceCents, dueDate, status });
  }
  return rows;
}
