// Prospect finder rules: what to skip, how to score fit, and how to read a business website.
// Plain JS with no network access, so it can be tested directly.

/** Comma-separated exclusions -> lower-case list. */
export const parseExclude = (text) =>
  String(text || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** True when the business name contains any excluded word (e.g. a chain name). */
export const isExcluded = (name, exclude) => {
  const n = String(name || '').toLowerCase();
  return exclude.some((w) => n.includes(w));
};

/**
 * Fit score 0-100 with the reasons, from what the listing and website show.
 * Favors businesses that are reachable (website, email), well run (rating) and not already
 * saturated with customers (a moderate review count).
 */
export function scoreCandidate(c) {
  let score = 0;
  const reasons = [];
  const add = (points, why) => { score += points; reasons.push(why); };
  if (c.website) add(25, 'has a website');
  if (c.email) add(25, 'public email found');
  if (c.phone) add(10, 'phone listed');
  if (c.rating != null && c.rating >= 4.2) add(15, `rated ${c.rating}`);
  else if (c.rating != null && c.rating >= 3.8) add(8, `rated ${c.rating}`);
  if (c.reviews != null && c.reviews >= 10 && c.reviews <= 200) add(15, `${c.reviews} reviews: established, room to grow`);
  else if (c.reviews != null && c.reviews > 0 && c.reviews < 10) add(8, `${c.reviews} reviews: new or small`);
  if (c.operational !== false) add(10, 'open for business');
  return { score: Math.min(score, 100), reasons };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const JUNK = /(example\.|sentry|wixpress|domain\.com|email\.com|yourdomain|@2x|\.png|\.jpg|\.gif|\.webp|\.svg)/i;
// Prefer a general inbox a business expects strangers to use.
const PREFERRED = ['info', 'contact', 'hello', 'office', 'service', 'sales', 'admin', 'team', 'support'];

/** Bare host without "www.", e.g. "https://www.Shop.com/x" -> "shop.com". */
export const hostOf = (url) => {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

/**
 * The best public contact email in a page, or ''. Emails on the business's own domain win;
 * among those, general inboxes (info@, contact@) win over personal ones.
 */
export function pickEmail(html, siteUrl) {
  const host = hostOf(siteUrl);
  const found = new Set();
  const text = String(html || '').replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*/gi, '@');
  for (const m of text.matchAll(EMAIL)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, '');
    if (!JUNK.test(e)) found.add(e);
  }
  const list = [...found];
  if (!list.length) return '';
  const rank = (e) => {
    const [local, domain] = e.split('@');
    const own = host && (domain === host || domain.endsWith(`.${host}`)) ? 0 : 1;
    const general = PREFERRED.includes(local) ? 0 : 1;
    return own * 2 + general;
  };
  return list.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

/** One line on what the business says it does: the meta description, else the page title. */
export function pickAbout(html) {
  const h = String(html || '');
  const meta = h.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']{10,400})["']/i)
    || h.match(/<meta[^>]+content=["']([^"']{10,400})["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i);
  const title = h.match(/<title[^>]*>([^<]{3,200})<\/title>/i);
  const raw = meta?.[1] ?? title?.[1] ?? '';
  return decode(raw).replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** Pages worth checking for a contact email, in order. */
export function contactPages(siteUrl) {
  try {
    const u = new URL(siteUrl);
    const root = `${u.protocol}//${u.host}`;
    return [...new Set([siteUrl, `${root}/contact`, `${root}/contact-us`])];
  } catch {
    return [];
  }
}

/** True for addresses that must never be fetched from the server (loopback, private, link-local). */
export function isPrivateAddress(ip) {
  const v = String(ip).toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  const mapped = v.startsWith('::ffff:') ? v.slice(7) : v;
  const parts = mapped.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
