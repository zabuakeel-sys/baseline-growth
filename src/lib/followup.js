// Outreach to prospects we find for a client: when each is due for the next touch, what to
// say, and how the pipeline is doing. Plain JS so tests can load it directly.
//
// These people did not contact us, so the rhythm is gentler than for an inquiry: a first
// message, then follow-ups 3, 7 and 14 days later, until they reply or the sequence ends.
// Every email carries an opt-out line and the sender's postal address (required for
// commercial email in the US under CAN-SPAM). Anyone who opts out is never contacted again.

/** Days after the prospect was added for each touch. Touch 0 is the first message. */
export const SCHEDULE_DAYS = [0, 3, 7, 14];

export const SOURCES = ['Research', 'Referral', 'Event', 'Walk-in visit', 'Social media', 'Inbound to us', 'Other'];

/** Pipeline stages, in order. 'won' is stored as-is and shown as "Customer". */
export const STATUSES = {
  new: 'New',
  following_up: 'Reaching out',
  talking: 'Talking',
  introduced: 'Introduced to client',
  won: 'Customer',
  lost: 'Lost',
  opted_out: 'Do not contact',
};

export const LOST_REASONS = ['No response', 'Not interested', 'Email bounced', 'Price', 'Went with someone else', 'Not a fit', 'Timing', 'Other'];

const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Days from a to b, both 'YYYY-MM-DD'. */
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** When the next touch is due, or null when every scheduled touch has been sent. */
export function nextDue(addedOn, touchesSent) {
  if (touchesSent >= SCHEDULE_DAYS.length) return null;
  return addDays(addedOn, SCHEDULE_DAYS[touchesSent]);
}

/** True when the prospect still needs a touch on or before `today`. Only unanswered prospects are due. */
export function isDue(lead, today) {
  if (lead.status !== 'new' && lead.status !== 'following_up') return false;
  const due = nextDue(lead.received_on, lead.touches_sent);
  return due !== null && due <= today;
}

/** Every touch went out with no reply: time to mark it lost. */
export function needsDecision(lead) {
  return (lead.status === 'new' || lead.status === 'following_up') && lead.touches_sent >= SCHEDULE_DAYS.length;
}

// Words that mark a business name rather than a person, so "Tower Dental" is greeted "Hi there".
const BUSINESS = /\b(inc|llc|ltd|co|corp|company|group|services?|dental|clinic|medical|auto|automotive|repair|shop|garage|motors?|offices?|center|centre|plaza|tower|properties|property|management|cleaning|care|studio|salon|restaurant|cafe|bar|church|school|academy|hotel|detail(ing)?|tire|body|collision|glass|mechanics?|partners|associates|&)\b/i;

/** "Pat Lee" -> "Pat"; anything that does not look like a person's name -> "there". */
export function greetingName(name) {
  const n = String(name || '').trim();
  const words = n.split(/\s+/);
  const person = words.length >= 1 && words.length <= 3 && !BUSINESS.test(n) && !/\d/.test(n)
    && words.every((w) => /^[A-Z][A-Za-z'.-]+$/.test(w) && /[a-z]/.test(w));
  return person ? words[0] : 'there';
}
const firstName = greetingName;

/** Lower-cases a leading word so it reads mid-sentence; acronyms like "HVAC" stay as typed. */
const midSentence = (text) => {
  const t = String(text || '').trim().replace(/[.\s]+$/, '');
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};

/**
 * The suggested message for a touch. Short, plain, one question each, never pushy.
 * offer:   one sentence on what the client does, e.g. "AutoAt sends drivers to independent shops near them".
 * need:    what we think this prospect needs, optional.
 * address: postal address for the email footer.
 */
/** Signature and opt-out line that end every outreach email, replies included. */
export function signOff({ clientName, senderName, address }) {
  const sign = `\n\n${senderName ? `${senderName}\n` : ''}On behalf of ${clientName}`;
  const optOut = `\n\nIf you'd rather not hear from us, reply "no thanks" and we won't contact you again.${address ? `\n${address.trim()}` : ''}`;
  return sign + optOut;
}

/** `personal` is an optional first line about this prospect (AI-written, from facts we found). */
export function messageFor(touch, { leadName, clientName, offer, need, senderName, address, personal }) {
  const hi = `Hi ${firstName(leadName)},`;
  const what = offer ? `${offer.trim().replace(/[.\s]+$/, '')}.` : `I work with ${clientName}.`;
  const fit = need ? ` I thought it could help with ${midSentence(need)}.` : '';
  const bodies = [
    `${hi}\n\n${personal ? `${personal.trim()} ` : ''}I'm reaching out on behalf of ${clientName}. ${what}${fit}\n\nWould a 10-minute call this week be worth it to see if it fits?`,
    `${hi}\n\nFollowing up on my note about ${clientName}. Is this something you handle, or is there someone better to talk to?`,
    `${hi}\n\nOne more try in case my last message got buried. Happy to send a short summary by email instead of a call. Would that help?`,
    `${hi}\n\nI'll stop here so I'm not cluttering your inbox. If ${clientName} is ever useful to you, just reply and I'll pick it up.`,
  ];
  return bodies[Math.min(touch, bodies.length - 1)] + signOff({ clientName, senderName, address });
}

/**
 * Pipeline numbers for a set of prospects. "Reached" = at least one touch sent or a reply.
 * Customer rate = customers / prospects reached.
 */
export function leadStats(leads) {
  const reached = leads.filter((l) => l.touches_sent > 0 || ['talking', 'introduced', 'won'].includes(l.status));
  const replied = leads.filter((l) => ['talking', 'introduced', 'won'].includes(l.status) || (l.status === 'lost' && l.lost_reason !== 'No response'));
  const introduced = leads.filter((l) => l.status === 'introduced' || l.status === 'won' || l.introduced_on);
  const customers = leads.filter((l) => l.status === 'won');
  return {
    total: leads.length,
    reached: reached.length,
    replied: replied.length,
    introduced: introduced.length,
    customers: customers.length,
    customerRate: reached.length ? Math.round((customers.length / reached.length) * 100) : null,
  };
}

/**
 * Fills the owner's perfected email template for one prospect. Replaces {first_name}, {name} and
 * {business}; adds a greeting if the owner didn't write one. Used for the first email when the
 * owner has written a custom one.
 */
export function fillEmail(text, { firstName = '', name = '', clientName = '' } = {}) {
  const first = firstName || greetingName(name) || 'there';
  let out = String(text || '')
    .replace(/\{\s*first[_ ]?name\s*\}/gi, first)
    .replace(/\{\s*name\s*\}/gi, name || first)
    .replace(/\{\s*(business|client|company|shop)\s*\}/gi, clientName || '');
  if (!/^\s*(hi|hey|hello|dear)\b/i.test(out)) out = `Hi ${first},\n\n${out.trim()}`;
  return out.trim();
}
