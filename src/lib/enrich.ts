// Finding who to contact at each prospect: the business's own website, then Hunter, then Apollo.
// Runs automatically inside the outreach cycle, up to a daily cap (finding a contact costs credits).
import { query } from './db';
import { researchWebsite, eachLimited } from './research';
import { hunterConfigured, hunterDomainSearch } from './hunter';
import { apolloConfigured, apolloFindContact } from './apollo';
import { domainOf, mergeContacts, type Contact, type MergedContact } from './contact';

/** True when at least one paid source (Hunter or Apollo) is set up. */
export const enrichConfigured = () => hunterConfigured() || apolloConfigured();

/** The first http(s) line in a lead's notes, where the finder stores the website. */
export function websiteFromNotes(notes: string): string {
  return (notes || '').split('\n').map((s) => s.trim()).find((s) => /^https?:\/\//i.test(s)) ?? '';
}

/**
 * Who to contact at one business, merged from the website (free), Hunter and Apollo (paid, only when
 * their keys are set). Returns the best email and the most senior named person, or null.
 */
export async function findContact(
  { website, email, name }: { website?: string; email?: string; name?: string },
): Promise<MergedContact | null> {
  const domain = domainOf(website ?? '') || domainOf(email ?? '');
  const sources: (Contact | null)[] = [];

  if (website) {
    try {
      const w = await researchWebsite(website);
      if (w.email) sources.push({ email: w.email, name: '', title: '', source: 'website' });
    } catch { /* ignore a bad site */ }
  }
  const paid: Promise<void>[] = [];
  if (domain && hunterConfigured()) paid.push(hunterDomainSearch(domain).then((h) => { if (h) sources.push(h); }).catch(() => {}));
  if (domain && apolloConfigured()) paid.push(apolloFindContact(domain).then((a) => { if (a) sources.push(a); }).catch(() => {}));
  await Promise.all(paid);

  // name is accepted for future use (Apollo person-match); the search already filters by seniority.
  void name;
  return mergeContacts(sources, domain);
}

type DueLead = { id: number; name: string; website: string; notes: string; email: string };

/**
 * Enriches prospects that have never been looked up, newest first, within today's remaining cap.
 * Every lead it touches is marked enriched (even a miss) so credits are never spent twice on one.
 */
export async function enrichDueLeads(maxThisRun = 40): Promise<{ enriched: number; found: number; note: string }> {
  const cap = (await query<{ enrich_daily_limit: number }>('SELECT enrich_daily_limit FROM outreach_settings WHERE id = 1')).rows[0]?.enrich_daily_limit ?? 0;
  if (cap <= 0) return { enriched: 0, found: 0, note: '' };
  const usedToday = Number((await query<{ n: string }>(
    `SELECT count(*) AS n FROM leads WHERE (enriched_at AT TIME ZONE 'America/Detroit')::date = (now() AT TIME ZONE 'America/Detroit')::date`)).rows[0].n);
  const budget = Math.min(maxThisRun, cap - usedToday);
  if (budget <= 0) return { enriched: 0, found: 0, note: `Contact lookups: daily cap of ${cap} reached` };

  const leads = (await query<DueLead>(
    `SELECT id, name, website, notes, email FROM leads
       WHERE enriched_at IS NULL AND status IN ('new', 'following_up', 'talking')
       ORDER BY received_on DESC, id DESC LIMIT $1`, [budget])).rows;
  if (!leads.length) return { enriched: 0, found: 0, note: '' };

  let found = 0;
  await eachLimited(leads, 4, async (l) => {
    const website = l.website || websiteFromNotes(l.notes);
    const c = await findContact({ website, email: l.email, name: l.name });
    if (c && (c.email || c.contactName)) {
      found++;
      await query(
        `UPDATE leads SET
           email = CASE WHEN email = '' AND $2 <> '' THEN $2 ELSE email END,
           contact_name = $3, contact_title = $4, contact_source = $5, enriched_at = now()
         WHERE id = $1`,
        [l.id, c.email || '', c.contactName || '', c.contactTitle || '', c.source || '']);
    } else {
      await query('UPDATE leads SET enriched_at = now() WHERE id = $1', [l.id]);
    }
  });
  return { enriched: leads.length, found, note: `Contacts: looked up ${leads.length}, found ${found}` };
}
