// Reads facts off a business's own website for sign-up: name, logo, phone, booking link, the
// pages worth reading, and the visible text. Plain JS so tests can load it directly.
// Nothing here guesses: it only returns what is on the page.

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const meta = (html, name) => {
  const a = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'));
  return a ? decode(a[1]).trim() : '';
};

const abs = (href, base) => { try { return new URL(decode(href), base).toString(); } catch { return ''; } };

/** Visible text: scripts, styles and tags removed, whitespace collapsed. */
export function visibleText(html) {
  return decode(String(html || '')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim();
}

const LOGO_HINT = /logo/i;
const BOOK_HINT = /\b(book|schedule|appointment|get a quote|free quote|request a quote|estimate|walkthrough|consultation|sign ?up|get started)\b/i;
const PAGE_HINT = /\/(about|about-us|services?|what-we-do|pricing|prices|rates|service-areas?|areas?-we-serve|locations?|industries|who-we-serve|faq|contact|contact-us)\b/i;

/** Facts from one page of the site. */
export function extractSite(html, baseUrl) {
  const h = String(html || '');
  const base = (() => { try { return new URL(baseUrl); } catch { return null; } })();
  const title = decode(h.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? '').trim();
  const siteName = meta(h, 'og:site_name') || title.split(/\s[|–\-:]\s/)[0].trim();
  // Logo: an <img> marked as the logo, else the site's share image.
  let logo = '';
  for (const m of h.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (src && (LOGO_HINT.test(tag)) && !/^data:/i.test(src)) { logo = abs(src, base); break; }
  }
  if (!logo && meta(h, 'og:image')) logo = abs(meta(h, 'og:image'), base);
  if (logo && !logo.startsWith('https://')) logo = '';
  const phones = [...new Set([...h.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decode(m[1]).replace(/[^\d+()\-. ]/g, '').trim()).filter((p) => p.replace(/\D/g, '').length >= 10))];
  let bookingLink = '';
  const links = [];
  for (const m of h.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(m[1], base);
    if (!url.startsWith('http')) continue;
    const text = visibleText(m[2]).slice(0, 80);
    if (!bookingLink && (BOOK_HINT.test(text) || /calendly\.com|acuityscheduling|squareup\.com\/appointments|\/book(ing)?\b/i.test(url)) && !/^mailto|^tel/i.test(m[1])) bookingLink = url;
    if (base && new URL(url).host === base.host && PAGE_HINT.test(new URL(url).pathname)) links.push(url.split('#')[0].split('?')[0]);
  }
  return { title, siteName, description: meta(h, 'description') || meta(h, 'og:description'), logo, phones, bookingLink, links: [...new Set(links)], text: visibleText(h) };
}

/** The pages worth reading after the home page: about, services, pricing, areas, contact. At most `max`. */
export function pagesToRead(links, max = 4) {
  const order = [/about/i, /service|what-we-do|industries|who-we-serve/i, /pricing|prices|rates/i, /area|location/i, /faq/i, /contact/i];
  const out = [];
  for (const re of order) {
    const hit = links.find((l) => re.test(new URL(l).pathname) && !out.includes(l));
    if (hit) out.push(hit);
    if (out.length >= max) break;
  }
  return out;
}
