// "Next up": the order a rep works their prospects in, one at a time. Plain JS for tests.
//
//   1. They replied: someone is waiting on us.
//   2. Calls and visits due today or overdue (most overdue first).
//   3. New prospects with a phone number nobody has contacted yet.
// Prospects the rep skipped this session go to the back, in the order skipped.

const isReplied = (l) => /^They replied/.test(l.next_action || '');

/** Why this prospect is up, for the card's label. */
export function reasonFor(l, today) {
  if (isReplied(l) && l.next_action_on && l.next_action_on <= today) return 'replied';
  if (l.next_action_on && l.next_action_on <= today) return /^Visit/.test(l.next_action || '') ? 'visit' : 'call';
  return 'new';
}

export function nextQueue(leads, today, skipped = []) {
  const due = [];
  for (const l of leads) {
    if (!['new', 'following_up', 'talking', 'introduced'].includes(l.status)) continue;
    // A booked meeting is the next step: it shows under Meetings, not in the call queue.
    if ((l.meetings || []).some((m) => m.status === 'scheduled')) continue;
    if (l.next_action_on && l.next_action_on <= today) {
      due.push({ lead: l, rank: isReplied(l) ? 0 : 1, sort: l.next_action_on });
    } else if (!l.next_action_on && l.phone && (l.status === 'new' || l.status === 'following_up') && !(l.activity || []).length) {
      due.push({ lead: l, rank: 2, sort: l.received_on });
    }
  }
  due.sort((a, b) => a.rank - b.rank || (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.lead.id - b.lead.id));
  const order = due.map((d) => d.lead);
  const skip = skipped.map(Number);
  const fresh = order.filter((l) => !skip.includes(l.id));
  const later = skip.map((id) => order.find((l) => l.id === id)).filter(Boolean);
  return [...fresh, ...later];
}
