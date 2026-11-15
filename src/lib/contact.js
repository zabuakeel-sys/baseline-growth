// Choosing who to contact at a business, and their email, from what the website, Hunter and Apollo
// return. Pure functions only (no network), so the ranking is unit-tested.

const GENERIC_LOCALPARTS = [
  'info', 'contact', 'hello', 'office', 'admin', 'sales', 'support', 'team', 'mail',
  'enquiries', 'inquiries', 'enquiry', 'inquiry', 'booking', 'bookings', 'reception',
  'frontdesk', 'service', 'help', 'accounts', 'billing', 'general', 'hi', 'ask',
];

// Highest tier wins. These match a job title to how much of a decision-maker the person is.
const TITLE_TIERS = [
  [/\b(owner|founder|co-?founder|proprietor|owner[\s/-]?operator)\b/i, 100],
  [/\b(ceo|chief executive|president|principal|managing (director|partner)|\bmd\b)\b/i, 90],
  [/\b(partner|vice president|\bvp\b|operations director|director of operations)\b/i, 80],
  [/\b(office manager|practice manager|general manager|\bgm\b|operations manager|business manager)\b/i, 72],
  [/\b(director)\b/i, 70],
  [/\b(manager|head of)\b/i, 60],
  [/\b(administrator|coordinator|supervisor|team lead|lead)\b/i, 45],
];

/** The registrable host of a website or email, lowercased, without a leading www. '' if none. */
export function domainOf(input) {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  if (s.includes('@')) s = s.split('@').pop();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+\.[a-z]{2,}$|^[a-z0-9-]+\.[a-z]{2,}$/.test(s) ? s : '';
}

/** A real, reachable address: not an Apollo "locked" placeholder and shaped like an email. */
export function isUsableEmail(email) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  if (e.includes('not_unlocked') || e.includes('email_not_unlocked')) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e);
}

/** A role inbox (info@, office@) rather than a person. */
export function looksGeneric(email) {
  const local = String(email || '').toLowerCase().split('@')[0];
  return GENERIC_LOCALPARTS.includes(local);
}

/** 0 (unknown) to 100 (owner): how senior a job title is. */
export function titleRank(title) {
  const t = String(title || '');
  let best = 0;
  for (const [re, score] of TITLE_TIERS) if (score > best && re.test(t)) best = score;
  return best;
}

export function fullName(first, last) {
  return [first, last].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
}

/** Best email + person from a Hunter domain-search response, or null. */
export function parseHunter(json) {
  const emails = json && json.data && json.data.emails;
  if (!Array.isArray(emails) || !emails.length) return null;
  const scored = emails
    .filter((e) => isUsableEmail(e && e.value))
    .map((e) => ({
      email: String(e.value).toLowerCase(),
      name: fullName(e.first_name, e.last_name),
      title: String(e.position || '').trim(),
      rank: titleRank(e.position) + (e.type === 'personal' ? 20 : 0) + Number(e.confidence || 0) / 10,
    }));
  if (!scored.length) return null;
  scored.sort((a, b) => b.rank - a.rank);
  const top = scored[0];
  return { email: top.email, name: top.name, title: top.title, source: 'hunter' };
}

/** Best decision-maker from an Apollo people-search list, or null. Apollo often locks the email. */
export function bestApolloPerson(people) {
  if (!Array.isArray(people) || !people.length) return null;
  const scored = people
    .map((p) => ({
      email: isUsableEmail(p && p.email) ? String(p.email).toLowerCase() : '',
      name: (p && p.name) || fullName(p && p.first_name, p && p.last_name),
      title: String((p && p.title) || '').trim(),
    }))
    .filter((p) => p.name || p.email)
    .map((p) => ({ ...p, rank: titleRank(p.title) + (p.email ? 15 : 0) }));
  if (!scored.length) return null;
  scored.sort((a, b) => b.rank - a.rank);
  const top = scored[0];
  return { email: top.email, name: top.name, title: top.title, source: 'apollo' };
}

const onDomain = (email, domain) => {
  if (!domain) return false;
  const d = String(email).split('@')[1] || '';
  return d === domain || d.endsWith(`.${domain}`);
};

/**
 * Merge what the sources found into one answer: the most senior named person, and the best email
 * (own-domain and a real person before a role inbox). `candidates` is a list of
 * { email?, name?, title?, source } from the website, Hunter and Apollo. null if nothing usable.
 */
export function mergeContacts(candidates, domain = '') {
  const list = (candidates || []).filter(Boolean);
  if (!list.length) return null;

  const named = list.filter((c) => c.name).sort((a, b) => titleRank(b.title) - titleRank(a.title));
  const person = named[0] || null;

  const emailScore = (e) => (onDomain(e, domain) ? 2 : 0) + (looksGeneric(e) ? 0 : 1);
  const emails = list
    .map((c) => ({ email: c.email, source: c.source }))
    .filter((c) => isUsableEmail(c.email))
    .sort((a, b) => emailScore(b.email) - emailScore(a.email));
  const email = emails.length ? emails[0].email.toLowerCase() : '';

  if (!person && !email) return null;
  const parts = [];
  if (person) parts.push(person.source);
  if (email) { const es = emails[0].source; if (es && es !== person?.source) parts.push(es); }
  return {
    email,
    contactName: person ? person.name : '',
    contactTitle: person ? person.title : '',
    source: [...new Set(parts.filter(Boolean))].join('+') || 'website',
  };
}
