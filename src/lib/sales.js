// Sales team rules: what a logged call or visit does to a prospect, the rep scoreboard, and
// commission. Plain JS so tests can load it directly.

export const CHANNELS = { call: 'Call', visit: 'Visit', email: 'Email', linkedin: 'LinkedIn' };

/**
 * Outcomes a rep can log, and what each one does:
 *   status     the prospect's new stage (null = unchanged)
 *   lost       the lost reason, when it closes the prospect
 *   conversation  whether it counts as a real conversation on the scoreboard
 *   nextDays   default days until the next step (null = no follow-up needed)
 */
export const OUTCOMES = {
  no_answer:      { label: 'No answer',      status: null,      conversation: false, nextDays: 2 },
  voicemail:      { label: 'Left voicemail', status: null,      conversation: false, nextDays: 3 },
  gatekeeper:     { label: 'Gatekeeper',     status: null,      conversation: false, nextDays: 2 },
  talked:         { label: 'Talked',         status: 'talking', conversation: true,  nextDays: 3 },
  meeting_booked: { label: 'Meeting booked', status: 'talking', conversation: true,  nextDays: null },
  signed:         { label: 'Signed / bought', status: 'won',    conversation: true,  nextDays: null },
  not_interested: { label: 'Not interested', status: 'lost',    conversation: true,  nextDays: null, lost: 'Not interested' },
  wrong_number:   { label: 'Wrong contact',  status: null,      conversation: false, nextDays: null },
};

/** Statuses a logged outcome may move a prospect out of. A customer or an opt-out is never changed. */
const MOVABLE = ['new', 'following_up', 'talking', 'introduced'];

/**
 * The change a logged outcome makes to a prospect. Returns { status, lostReason, nextActionOn }
 * where status is null when the stage stays as it is.
 */
export function applyOutcome(lead, outcome, today) {
  const rule = OUTCOMES[outcome];
  if (!rule) throw new Error(`Unknown outcome: ${outcome}`);
  const canMove = MOVABLE.includes(lead.status);
  let status = canMove ? rule.status : null;
  // "Talked" never moves an introduced prospect back a stage.
  if (status === 'talking' && lead.status === 'introduced') status = null;
  return {
    status: status && status !== lead.status ? status : null,
    lostReason: status === 'lost' ? rule.lost : null,
    nextActionOn: rule.nextDays == null ? null : addDays(today, rule.nextDays),
  };
}

const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Scoreboard rows per rep for a period.
 * activities: [{ user_id, channel, outcome }]  meetings: [{ booked_by, status }]
 * customers:  [{ won_by }]  users: [{ id, name }]
 */
export function scoreboard({ users, activities, meetings, customers }) {
  return users.map((u) => {
    const mine = activities.filter((a) => a.user_id === u.id);
    const booked = meetings.filter((m) => m.booked_by === u.id);
    return {
      userId: u.id,
      name: u.name,
      calls: mine.filter((a) => a.channel === 'call').length,
      visits: mine.filter((a) => a.channel === 'visit').length,
      conversations: mine.filter((a) => OUTCOMES[a.outcome]?.conversation).length,
      meetingsBooked: booked.length,
      meetingsHeld: booked.filter((m) => m.status === 'held').length,
      customers: customers.filter((c) => c.won_by === u.id).length,
    };
  });
}

/**
 * Commission per rep, in cents: the rep's percent of what we earned on the customers they won.
 * "Earned" means billed amounts only: the confirmed revenue share inside the share window, plus
 * any fee per new customer. Unconfirmed revenue earns no commission until it is confirmed.
 * customers: [{ id, won_by, customer_since, client_id }]
 * revenue:   [{ lead_id, month, revenue_cents, confirmed }]
 * clients:   { [id]: { share_percent, share_months, signup_fee_cents } }
 * rates:     { [userId]: percent }
 * shareFor:  (revenueCents, sharePercent) => cents;  inWindow: (startMonth, month, shareMonths) => bool
 */
export function commissions({ customers, revenue, clients, rates, inWindow, shareFor, monthOf }) {
  const earned = new Map();
  const add = (userId, cents) => earned.set(userId, (earned.get(userId) ?? 0) + cents);
  for (const c of customers) {
    if (!c.won_by || !c.customer_since) continue;
    const terms = clients[c.client_id];
    if (!terms) continue;
    add(c.won_by, terms.signup_fee_cents || 0);
    const start = monthOf(c.customer_since);
    for (const r of revenue) {
      if (r.lead_id !== c.id || !r.confirmed || !inWindow(start, monthOf(r.month), terms.share_months)) continue;
      add(c.won_by, shareFor(r.revenue_cents, terms.share_percent || 0));
    }
  }
  return [...earned].map(([userId, earnedCents]) => ({
    userId,
    earnedCents,
    commissionCents: Math.round((earnedCents * (rates[userId] || 0)) / 100),
  }));
}
