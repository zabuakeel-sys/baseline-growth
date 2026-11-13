// Reads facts off a business's own website for sign-up: name, logo, phone, booking link, the
// pages worth reading, and the visible text. Plain JS so tests can load it directly.
// Nothing here guesses: it only returns what is on the page.
import { pickEmail } from './finder.js';

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

/** Structured business data many sites embed for Google (schema.org JSON-LD). */
export function structuredData(html) {
  const out = { name: '', telephone: '', email: '', address: '', areas: [], logo: '' };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node['@graph']) visit(node['@graph']);
    const type = [].concat(node['@type'] || []).join(' ');
    if (/Business|Organization|Service|Store|Contractor|Clinic|Office|Restaurant|Agency|Company/i.test(type)) {
      if (!out.name && typeof node.name === 'string') out.name = node.name.trim();
      if (!out.telephone && typeof node.telephone === 'string') out.telephone = node.telephone.trim();
      if (!out.email && typeof node.email === 'string') out.email = node.email.replace(/^mailto:/i, '').trim().toLowerCase();
      const a = [].concat(node.address || [])[0];
      if (!out.address && a) {
        out.address = typeof a === 'string' ? a.trim()
          : [a.streetAddress, [a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');
      }
      for (const area of [].concat(node.areaServed || [])) {
        const n = typeof area === 'string' ? area : area?.name;
        if (n && !out.areas.includes(n.trim())) out.areas.push(n.trim());
      }
      const logo = typeof node.logo === 'string' ? node.logo : node.logo?.url;
      if (!out.logo && typeof logo === 'string' && logo.startsWith('https://')) out.logo = logo;
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v);
  };
  for (const m of String(html || '').matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())); } catch { /* broken JSON on their site: skip */ }
  }
  return out;
}

/** A US street address written on the page ("123 Main St, Troy, MI 48084"). */
export function findAddress(text) {
  const m = String(text || '').match(/\b\d{1,6} [A-Za-z0-9.' -]{2,40}?\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pkwy|Parkway|Hwy|Highway|Pl|Place|Cir|Circle)\b\.?(?:,? (?:Suite|Ste\.?|Unit|#) ?[A-Za-z0-9-]+)?,? [A-Za-z .'-]{2,30}, ?[A-Z]{2},? \d{5}(?:-\d{4})?\b/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

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
  const sd = structuredData(h);
  const text = visibleText(h);
  if (sd.logo && !LOGO_HINT.test(logo)) logo = sd.logo;
  if (sd.telephone && !phones.length) phones.push(sd.telephone);
  return {
    title, siteName: sd.name || siteName, description: meta(h, 'description') || meta(h, 'og:description'), logo, phones, bookingLink,
    email: sd.email || (base ? pickEmail(h, base.toString()) : ''), address: sd.address || findAddress(text), areas: sd.areas,
    links: [...new Set(links)], text,
  };
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
