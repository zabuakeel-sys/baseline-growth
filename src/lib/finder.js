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
export function scoreCandidate(c, play = '') {
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
  // Play-aware fit: what makes a strong target for THIS client's offer. These lift the prospects
  // that fit the strategy above the ones that merely have a phone.
  for (const [points, why] of fitSignals(c, play)) add(points, why);
  return { score: Math.min(score, 100), reasons };
}

/**
 * Why a prospect is a good fit for a given play, as [points, reason] pairs. Uses only what the
 * finder knows (web presence, rating, reviews, reachability). No play (or an unknown one) returns [].
 */
export function fitSignals(c, play = '') {
  if (!play) return [];
  const out = [];
  const noSite = !c.website;
  const lowRating = c.rating != null && c.rating < 3.8;
  const fewReviews = c.reviews != null && c.reviews < 10;
  const manyReviews = c.reviews != null && c.reviews >= 100;
  if (play === 'claim_listing') {
    if (noSite) out.push([15, 'no website yet, so a listing gets them found online']);
    if (fewReviews) out.push([8, 'few reviews, so they need more customers']);
    if (lowRating) out.push([6, 'low rating, so more bookings would help']);
  } else if (play === 'free_demo' || play === 'free_trial') {
    if (c.website) out.push([10, 'has a website, so likely open to software']);
    if (manyReviews) out.push([6, 'busy, so more to gain from the tool']);
  } else if (play === 'free_sample' || play === 'wholesale_account') {
    if (manyReviews) out.push([10, 'established buyer, so higher volume']);
    if (c.phone) out.push([4, 'reachable by phone to talk stock']);
  } else if (play === 'free_consultation' || play === 'free_quote') {
    if (c.website) out.push([8, 'has a website, so established and reachable']);
    if (lowRating) out.push([6, 'low rating, so a clear reason to improve']);
  } else if (play === 'free_walkthrough') {
    if (c.phone && c.address) out.push([6, 'local and reachable for a visit']);
  }
  return out;
}

/** The fit reasons for a prospect under a play, as plain phrases (for showing a rep why it's a good lead). */
export function fitReasons(c, play = '') {
  return fitSignals(c, play).map(([, why]) => why);
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
