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
    `${hi}\n\n${personal ? `${personal.trim()} ` : ''}I'm reaching out on behalf of ${clientName}. ${what}${fit}\n\nWorth a quick look? Ten minutes and you'll know if it's useful.`,
    `${hi}\n\nCircling back on ${clientName}. Quick question: is this something you handle, or is there a better person for me to talk to?`,
    `${hi}\n\nLast note from me for now: if ${clientName} could be worth a short call, I'll keep it brief and work around your schedule. If the timing is off, just say so.`,
    `${hi}\n\nI'll leave it here so I'm not cluttering your inbox. If ${clientName} is ever useful, reply and I'll pick it straight back up.`,
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

export const OPT_OUT_LINE = 'If you\'d rather not hear from us, reply "no thanks" and we won\'t contact you again.';

/**
 * Fills the owner's perfected email template for one prospect. Understands both [Square bracket]
 * and {curly} placeholders: first name, the prospect's shop/business name, city, the client's name
 * (platform/business), the claim link, the mailing address, and unsubscribe. Adds a greeting if the
 * owner didn't write one. The legal footer is handled separately by ensureFooter.
 */
export function fillEmail(text, { firstName = '', name = '', city = '', clientName = '', claimUrl = '', address = '' } = {}, addGreeting = true) {
  const first = firstName || greetingName(name) || 'there';
  let out = String(text || '');
  const sub = (re, val) => { out = out.replace(re, val); };
  sub(/\[\s*first[_ ]?name\s*\]|\{\s*first[_ ]?name\s*\}/gi, first);
  sub(/\[\s*(shop(\s*name)?|business\s*name|their\s*name|prospect)\s*\]|\{\s*(shop|shop_name|prospect)\s*\}/gi, name || first);
  sub(/\[\s*city\s*\]|\{\s*city\s*\}/gi, city || 'your area');
  sub(/\[\s*(platform|our\s*(app|platform|product|service)|company|client)\s*\]|\{\s*(platform|business|company|client)\s*\}/gi, clientName || '');
  sub(/\[[^\]]*\b(claim|book|get|request|start|see|try|schedule|reserve|grab|open)\b[^\]]*\]|\{\s*(claim(_?link)?|link|url)\s*\}/gi, claimUrl || '');
  sub(/\[[^\]]*\b(mailing\s*)?address\b[^\]]*\]|\{\s*(mailing_?)?address\s*\}/gi, (address || '').trim());
  sub(/\[[^\]]*\bunsubscribe\b[^\]]*\]|\{\s*unsubscribe\s*\}|\[[^\]]*\bopt[\s-]?out\b[^\]]*\]/gi, OPT_OUT_LINE);
  sub(/\{\s*name\s*\}/gi, name || first);
  // Only a body gets a greeting; a subject line must not (passing addGreeting = false).
  if (addGreeting && !/^\s*(hi|hey|hello|dear)\b/i.test(out)) out = `Hi ${first},\n\n${out.trim()}`;
  return out.trim();
}

/** Makes sure an opt-out and the mailing address are present (US law), without duplicating them. */
export function ensureFooter(body, { address = '' } = {}) {
  let out = String(body || '').trim();
  if (!/no thanks|unsubscribe|opt[\s-]?out|rather not hear/i.test(out)) out += `\n\n${OPT_OUT_LINE}`;
  const addr = (address || '').trim();
  if (addr && !out.includes(addr)) out += `\n${addr}`;
  return out;
}

/**
 * A plain, honest opening email built from any business's own answers, used as the editable
 * starting draft when the AI writer is off. Works for any kind of business: it leans on the
 * business's own one-line offer and sends the prospect to its booking link, with no invented
 * claims, numbers or hype. Placeholders ([First name], [Shop Name], [City]) and {link} are filled
 * per prospect at send time by fillEmail; the signature and legal opt-out are added when sending.
 *
 * Deliberately avoids the word "free" in the subject (a strong spam trigger) and uses exactly one
 * link, so it reads like a person's note, not a blast.
 */
export function openingTemplate({ clientName = '', offer = '', hasLink = false } = {}) {
  const name = String(clientName || '').trim() || 'us';
  const what = String(offer || '').trim().replace(/[.\s]+$/, '');
  const intro = what ? `${what}.` : `I work with ${name}.`;
  const cta = hasLink
    ? `If [Shop Name] is open to it, you can start here: {link}`
    : `If [Shop Name] is open to it, just reply and I'll send the details.`;
  const body = [
    `Hi [First name],`,
    `${intro} I'd like to get [Shop Name] in [City] set up with ${name}.`,
    cta,
    `If someone else handles this at [Shop Name], feel free to pass this along.`,
  ].join('\n\n');
  return { subject: `${name} for [Shop Name]`, body };
}
