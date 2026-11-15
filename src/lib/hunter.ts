// Hunter.io domain search: given a business's domain, returns the best email and the person it
// belongs to. Strong for small local businesses whose address is on their own site. The API key is
// HUNTER_API_KEY (copy it from Kacity). Without the key this does nothing.
import { parseHunter, type Contact } from './contact';

export const hunterConfigured = () => Boolean(process.env.HUNTER_API_KEY);

export async function hunterDomainSearch(domain: string): Promise<Contact | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !domain) return null;
  try {
    const u = new URL('https://api.hunter.io/v2/domain-search');
    u.searchParams.set('domain', domain);
    u.searchParams.set('limit', '10');
    u.searchParams.set('api_key', key);
    const res = await fetch(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return parseHunter(await res.json());
  } catch {
    return null;
  }
}
