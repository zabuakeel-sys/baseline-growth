// What each client owes us, month by month. Plain JS so tests can load it directly.
//
// The rules, in one place:
// - Every month from the contract start month through the end month (or the current month)
//   is billed the monthly fee.
// - The growth bonus for a month = bonus percent x (that month's revenue - baseline revenue),
//   never below zero. It is only charged when BOTH the baseline and that month's result were
//   confirmed by the client. Unconfirmed numbers are shown, never billed.
// - A month is due on the 15th of the following month. Unpaid after that day = late.
// - All money is whole cents. Bonus cents are rounded to the nearest cent.

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

/** The day a month's bill is due: the 15th of the next month. */
export const dueDateOf = (month) => `${addMonths(month, 1).slice(0, 8)}15`;

/** Bonus in cents for one month, or 0. */
export function bonusCents({ bonusPercent, baselineCents, revenueCents }) {
  if (!bonusPercent || baselineCents == null || revenueCents == null) return 0;
  const growth = revenueCents - baselineCents;
  return growth > 0 ? Math.round((growth * bonusPercent) / 100) : 0;
}

/**
 * One client's statement.
 * client:   { monthly_fee_cents, bonus_percent, contract_start, contract_end }
 * baseline: { monthly_revenue_cents, signed_off } or null
 * results:  [{ month, revenue_cents, confirmed }]
 * payments: [{ month, amount_cents }]
 * today:    'YYYY-MM-DD'
 * Returns rows oldest first: { month, feeCents, bonusCents, bonusPending, growthCents, dueCents,
 * paidCents, balanceCents, dueDate, status } where status is 'paid' | 'open' | 'late' | 'upcoming'.
 */
export function statement({ client, baseline, results, payments, today }) {
  if (!client.contract_start) return [];
  const first = monthOf(client.contract_start);
  const thisMonth = monthOf(today);
  const lastByContract = client.contract_end ? monthOf(client.contract_end) : thisMonth;
  const last = lastByContract < thisMonth ? lastByContract : thisMonth;

  const resultByMonth = new Map(results.map((r) => [monthOf(r.month), r]));
  const paidByMonth = new Map();
  for (const p of payments) {
    const m = monthOf(p.month);
    paidByMonth.set(m, (paidByMonth.get(m) ?? 0) + p.amount_cents);
  }
  const baselineCents = baseline?.monthly_revenue_cents ?? null;

  const rows = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) {
    const result = resultByMonth.get(month);
    const growthCents = result && baselineCents != null ? result.revenue_cents - baselineCents : null;
    const potentialBonus = bonusCents({
      bonusPercent: client.bonus_percent, baselineCents, revenueCents: result?.revenue_cents ?? null,
    });
    const billable = Boolean(baseline?.signed_off && result?.confirmed);
    const bonus = billable ? potentialBonus : 0;
    const feeCents = client.monthly_fee_cents;
    const dueCents = feeCents + bonus;
    const paidCents = paidByMonth.get(month) ?? 0;
    const balanceCents = dueCents - paidCents;
    const dueDate = dueDateOf(month);
    let status;
    if (balanceCents <= 0) status = 'paid';
    else if (month === thisMonth) status = 'upcoming';
    else if (today > dueDate) status = 'late';
    else status = 'open';
    rows.push({
      month, feeCents, bonusCents: bonus, bonusPending: !billable && potentialBonus > 0,
      growthCents, dueCents, paidCents, balanceCents, dueDate, status,
    });
  }
  return rows;
}
