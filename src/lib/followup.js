// Inquiry follow-up: when each lead is due for its next touch, and what to say.
// Plain JS so tests can load it directly.
//
// The rhythm: reply the day the inquiry arrives, then follow up 1, 3, 7 and 14 days after it
// arrived, until the lead replies, buys or says no. After the last touch with no reply the
// lead is due a decision (mark it lost, or keep it open by hand).

/** Days after the inquiry for each touch. Touch 0 is the first reply. */
export const SCHEDULE_DAYS = [0, 1, 3, 7, 14];

export const SOURCES = ['Phone', 'Website', 'Email', 'Referral', 'Social media', 'Walk-in', 'Other'];

export const STATUSES = {
  new: 'New',
  following_up: 'Following up',
  talking: 'Talking',
  won: 'Won',
  lost: 'Lost',
};

export const LOST_REASONS = ['No response', 'Price', 'Went with someone else', 'Not a fit', 'Timing', 'Other'];

const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Days from a to b, both 'YYYY-MM-DD'. */
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * When the lead's next touch is due, given the date it arrived and how many touches were sent.
 * Returns null when every scheduled touch has been sent.
 */
export function nextDue(receivedOn, touchesSent) {
  if (touchesSent >= SCHEDULE_DAYS.length) return null;
  return addDays(receivedOn, SCHEDULE_DAYS[touchesSent]);
}

/** True when the lead still needs a touch on or before `today`. Only open, unanswered leads are due. */
export function isDue(lead, today) {
  if (lead.status !== 'new' && lead.status !== 'following_up') return false;
  const due = nextDue(lead.received_on, lead.touches_sent);
  return due !== null && due <= today;
}

/** True when every touch went out and the lead never replied: time to decide. */
export function needsDecision(lead) {
  return (lead.status === 'new' || lead.status === 'following_up') && lead.touches_sent >= SCHEDULE_DAYS.length;
}

const firstName = (name) => (String(name || '').trim().split(/\s+/)[0] || 'there');

/**
 * The suggested message for a touch. Short, plain, one question each; nothing that reads as
 * pressure. Placeholders come from the lead and the client.
 */
export function messageFor(touch, { leadName, clientName, need, senderName }) {
  const hi = `Hi ${firstName(leadName)},`;
  // "Nightly cleaning" reads as "about nightly cleaning" mid-sentence; acronyms like "HVAC" stay as typed.
  const trimmed = String(need || '').trim().replace(/[.\s]+$/, '');
  const phrase = /^[A-Z][a-z]/.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed;
  const about = phrase ? ` about ${phrase}` : '';
  const sign = `\n\n${senderName || ''}${senderName ? '\n' : ''}${clientName}`;
  const bodies = [
    `${hi}\n\nThanks for reaching out to ${clientName}${about}. I'd be glad to help. What's the best time for a quick call so I can get you an accurate answer?`,
    `${hi}\n\nFollowing up on your message${about}. Do you have a few minutes today or tomorrow to go over what you need?`,
    `${hi}\n\nI wanted to make sure my last note reached you. If it helps, I can send a quote by email instead. Would that be easier?`,
    `${hi}\n\nChecking in once more${about}. Is this still something you're looking for, or has it been taken care of?`,
    `${hi}\n\nI haven't heard back, so I'll close this out for now. If you still need help${about}, just reply here and I'll pick it right back up.`,
  ];
  return bodies[Math.min(touch, bodies.length - 1)] + sign;
}

const localDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date(iso));

/**
 * Summary numbers for a set of leads: count, won, lost, win rate, average first-reply time in hours.
 * Reply time only counts leads logged on the day they arrived: for one logged later, the real
 * arrival time is unknown and the number would flatter us.
 */
export function leadStats(leads) {
  const won = leads.filter((l) => l.status === 'won');
  const lost = leads.filter((l) => l.status === 'lost');
  const decided = won.length + lost.length;
  const replyHours = leads
    .filter((l) => l.first_touch_at && l.received_at && (!l.received_on || localDay(l.received_at) === l.received_on))
    .map((l) => (Date.parse(l.first_touch_at) - Date.parse(l.received_at)) / 3_600_000)
    .filter((h) => h >= 0);
  return {
    total: leads.length,
    won: won.length,
    lost: lost.length,
    open: leads.length - decided,
    winRate: decided ? Math.round((won.length / decided) * 100) : null,
    wonValueCents: won.reduce((s, l) => s + (l.won_value_cents || 0), 0),
    avgReplyHours: replyHours.length ? replyHours.reduce((s, h) => s + h, 0) / replyHours.length : null,
  };
}
