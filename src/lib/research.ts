// Reads a business's public website for a contact email and a line about what it does.
// Safety: the URLs come from third-party listings, so every hop is checked to resolve to a
// public address (never this server's network), redirects are followed by hand with the same
// check, and size and time are capped.
import { lookup } from 'node:dns/promises';
import { contactPages, isPrivateAddress, pickAbout, pickEmail } from './finder';

const MAX_BYTES = 600_000;
const allowPrivate = () => process.env.ALLOW_PRIVATE_FETCH === '1'; // tests only

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (allowPrivate()) return u;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

async function fetchPage(raw: string): Promise<string> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await safeUrl(current);
    if (!u) return '';
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BusinessContactLookup/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(7_000),
      });
    } catch {
      return '';
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return '';
      current = new URL(next, u).toString();
      continue;
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html') || !res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  return '';
}

/** Public contact email and one-line description from the business's own site. */
export async function researchWebsite(website: string): Promise<{ email: string; about: string }> {
  let email = '';
  let about = '';
  for (const page of contactPages(website)) {
    const html = await fetchPage(page);
    if (!html) continue;
    if (!about) about = pickAbout(html);
    email = pickEmail(html, website);
    if (email) break;
  }
  return { email, about };
}

/** Runs `fn` over items with at most `limit` at a time. */
export async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}
