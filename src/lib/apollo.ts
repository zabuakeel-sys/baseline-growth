// Apollo.io people search: given a business's domain, returns the most senior person Apollo knows
// there (owner, manager, director...) and their email when the plan reveals it. The API key is
// APOLLO_API_KEY (copy it from Kacity). Without the key this does nothing.
//
// Note on cost: this makes one search call per prospect. Apollo often returns the person's name and
// title but locks the email behind credits; we keep the name/title either way, so a rep still knows
// who to ask for. Emails that come back unlocked are used; locked placeholders are ignored.
import { bestApolloPerson, type Contact } from './contact';

export const apolloConfigured = () => Boolean(process.env.APOLLO_API_KEY);

export async function apolloFindContact(domain: string): Promise<Contact | null> {
  const key = process.env.APOLLO_API_KEY;
  if (!key || !domain) return null;
  try {
    const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
      // Both domain keys are sent for compatibility across Apollo API versions; extra keys are ignored.
      body: JSON.stringify({
        q_organization_domains_list: [domain],
        q_organization_domains: domain,
        person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'],
        page: 1,
        per_page: 10,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return bestApolloPerson((json && json.people) || []);
  } catch {
    return null;
  }
}
