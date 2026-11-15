// Running a saved search and turning found businesses into prospects. Shared by the Find page
// and by autopilot, so both behave the same.
import { query } from './db';
import { isExcluded, parseExclude, scoreCandidate } from './finder';
import { searchPlaces } from './places';
import { eachLimited, researchWebsite } from './research';
import { today } from './work';

/** Runs one saved search: finds businesses, drops known and unwanted ones, researches and scores the rest. */
export async function runSearch(targetId: number): Promise<{ found: number; added: number }> {
  const t = (await query<{ client_id: number; what: string; location: string; exclude: string; max_results: number }>(
    'SELECT client_id, what, location, exclude, max_results FROM targets WHERE id = $1', [targetId])).rows[0];
  if (!t) throw new Error('That search no longer exists.');
  // Mark it run first, so a failure does not retry the same paid search on every pass.
  // Marked as run up front so two overlapping runs do not search the same place twice; a failed
  // search puts it back, so it is retried and does not count against the daily limit.
  const before = (await query<{ last_run_at: Date | null }>(
    'UPDATE targets t SET last_run_at = now() FROM targets o WHERE t.id = $1 AND o.id = t.id RETURNING o.last_run_at', [targetId])).rows[0]?.last_run_at ?? null;
  let places;
  try {
    places = await searchPlaces(`${t.what} in ${t.location}`, t.max_results);
  } catch (err) {
    await query('UPDATE targets SET last_run_at = $2 WHERE id = $1', [targetId, before]);
    throw err;
  }
  const exclude = parseExclude(t.exclude);
  const seen = new Set((await query<{ place_id: string }>('SELECT place_id FROM candidates WHERE client_id = $1', [t.client_id])).rows.map((r) => r.place_id));
  const knownPhones = new Set((await query<{ p: string }>(
    "SELECT regexp_replace(phone, '\\D', '', 'g') AS p FROM leads WHERE (client_id = $1 OR status = 'opted_out') AND phone <> ''",
    [t.client_id])).rows.map((r) => r.p));
  const fresh = places.filter((p) =>
    !seen.has(p.placeId) && !isExcluded(p.name, exclude) && p.operational
    && Boolean(p.phone || p.website) // nobody could reach a business with neither
    && !(p.phone && knownPhones.has(p.phone.replace(/\D/g, ''))));

  let added = 0;
  await eachLimited(fresh, 6, async (p) => {
    const { email, about } = p.website ? await researchWebsite(p.website) : { email: '', about: '' };
    const { score, reasons } = scoreCandidate({ ...p, email });
    const r = await query(
      `INSERT INTO candidates (client_id, target_id, place_id, name, address, phone, website, email, about, rating, reviews, score, reasons, lat, lng, researched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now()) ON CONFLICT (client_id, place_id) DO NOTHING`,
      [t.client_id, targetId, p.placeId, p.name, p.address, p.phone, p.website, email, about, p.rating, p.reviews, score, reasons.join('; '), p.lat ?? null, p.lng ?? null]);
    added += r.rowCount ?? 0;
  });
  await query('UPDATE targets SET last_found = $2 WHERE id = $1', [targetId, added]);
  return { found: places.length, added };
}

type Candidate = { id: number; client_id: number; name: string; phone: string; email: string; about: string; website: string; address: string; rating: number | null; reviews: number | null; lat: number | null; lng: number | null };

/**
 * Turns found businesses into prospects in the outreach sequence today, assigned by `assign`.
 * Skips any without contact details and anyone who asked not to be contacted.
 */
export async function addCandidates(ids: number[], assign: (clientId: number) => number | null) {
  const rows = (await query<Candidate>(
    "SELECT id, client_id, name, phone, email, about, website, address, rating, reviews, lat, lng FROM candidates WHERE id = ANY($1) AND status = 'found' ORDER BY score DESC, id",
    [ids])).rows;
  let added = 0;
  let blocked = 0;
  for (const c of rows) {
    if (!c.phone && !c.email) { blocked++; continue; }
    const optedOut = await query(
      `SELECT 1 FROM leads WHERE status = 'opted_out' AND ((email <> '' AND email = $1) OR (phone <> '' AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')))`,
      [c.email, c.phone]);
    if (optedOut.rowCount) { blocked++; await query("UPDATE candidates SET status = 'skipped' WHERE id = $1", [c.id]); continue; }
    const notes = [c.about, c.website].filter(Boolean).join('\n');
    const lead = await query<{ id: number }>(
      `INSERT INTO leads (client_id, name, phone, email, source, need, notes, received_on, assignee_id, address, rating, reviews, website, lat, lng)
       VALUES ($1, $2, $3, $4, 'Research', '', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [c.client_id, c.name, c.phone, c.email, notes, today(), assign(c.client_id), c.address, c.rating, c.reviews, c.website, c.lat, c.lng]);
    await query("UPDATE candidates SET status = 'added', lead_id = $2 WHERE id = $1", [c.id, lead.rows[0].id]);
    added++;
  }
  return { added, blocked };
}
