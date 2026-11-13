'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isExcluded, parseExclude, scoreCandidate } from '@/lib/finder';
import { placesConfigured, searchPlaces } from '@/lib/places';
import { eachLimited, researchWebsite } from '@/lib/research';
import { parseWholeNumber } from '@/lib/money';
import { today } from '@/lib/work';

type Result = { error?: string };
const done = (msg: string): never => redirect(`/find?saved=${encodeURIComponent(msg)}`);

export async function addTarget(formData: FormData): Promise<Result> {
  await requireUser();
  const clientId = parseWholeNumber(formData.get('client_id'));
  const what = String(formData.get('what') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const exclude = String(formData.get('exclude') ?? '').trim();
  const max = parseWholeNumber(formData.get('max_results')) ?? 60;
  if (!clientId) return { error: 'Pick the client this search is for.' };
  if (!what) return { error: 'Say what kind of business to look for.' };
  if (!location) return { error: 'Say where to look, like "Detroit, MI".' };
  if (Number.isNaN(max) || max < 1 || max > 60) return { error: 'Results per run must be 1 to 60.' };
  const ok = await query('SELECT 1 FROM clients WHERE id = $1', [clientId]);
  if (!ok.rowCount) return { error: 'That client no longer exists.' };
  await query('INSERT INTO targets (client_id, what, location, exclude, max_results) VALUES ($1, $2, $3, $4, $5)',
    [clientId, what, location, exclude, max]);
  revalidatePath('/find');
  return done('Search saved. Run it to find businesses');
}

export async function deleteTarget(targetId: number) {
  await requireUser();
  await query('DELETE FROM targets WHERE id = $1', [targetId]);
  revalidatePath('/find');
  return done('Search removed');
}

/**
 * Runs one saved search: finds businesses, drops chains and ones already found or already
 * prospects, reads each website for a contact email, scores fit, and queues them for approval.
 */
export async function runTarget(targetId: number): Promise<Result> {
  await requireUser();
  if (!placesConfigured()) return { error: 'The business search is not connected yet. Add GOOGLE_PLACES_API_KEY in Railway first.' };
  const t = (await query<{ client_id: number; what: string; location: string; exclude: string; max_results: number }>(
    'SELECT client_id, what, location, exclude, max_results FROM targets WHERE id = $1', [targetId])).rows[0];
  if (!t) return { error: 'That search no longer exists.' };

  let places;
  try {
    places = await searchPlaces(`${t.what} in ${t.location}`, t.max_results);
  } catch (err) {
    return { error: `The business search failed: ${(err as Error).message}` };
  }
  const exclude = parseExclude(t.exclude);
  const seen = new Set((await query<{ place_id: string }>('SELECT place_id FROM candidates WHERE client_id = $1', [t.client_id])).rows.map((r) => r.place_id));
  const prospectPhones = new Set((await query<{ p: string }>(
    "SELECT regexp_replace(phone, '\\D', '', 'g') AS p FROM leads WHERE client_id = $1 AND phone <> '' UNION SELECT regexp_replace(phone, '\\D', '', 'g') FROM leads WHERE status = 'opted_out' AND phone <> ''",
    [t.client_id])).rows.map((r) => r.p));
  const fresh = places.filter((p) =>
    !seen.has(p.placeId) && !isExcluded(p.name, exclude) && p.operational
    && Boolean(p.phone || p.website) // nobody could reach a business with neither
    && !(p.phone && prospectPhones.has(p.phone.replace(/\D/g, ''))));

  let added = 0;
  await eachLimited(fresh, 6, async (p) => {
    const { email, about } = p.website ? await researchWebsite(p.website) : { email: '', about: '' };
    const { score, reasons } = scoreCandidate({ ...p, email });
    const r = await query(
      `INSERT INTO candidates (client_id, target_id, place_id, name, address, phone, website, email, about, rating, reviews, score, reasons, researched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()) ON CONFLICT (client_id, place_id) DO NOTHING`,
      [t.client_id, targetId, p.placeId, p.name, p.address, p.phone, p.website, email, about, p.rating, p.reviews, score, reasons.join('; ')]);
    added += r.rowCount ?? 0;
  });
  await query('UPDATE targets SET last_run_at = now(), last_found = $2 WHERE id = $1', [targetId, added]);
  revalidatePath('/find');
  return done(`Found ${places.length} businesses; ${added} new ones are ready for review`);
  return {};
}

/** Approved businesses become prospects and enter the outreach sequence today. */
export async function reviewCandidates(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const ids = formData.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const decision = String(formData.get('decision') ?? '');
  if (!ids.length) return { error: 'Tick at least one business first.' };
  if (decision === 'skip') {
    await query("UPDATE candidates SET status = 'skipped' WHERE id = ANY($1) AND status = 'found'", [ids]);
    revalidatePath('/find');
    return done(`${ids.length} skipped`);
  }
  if (decision !== 'add') return { error: 'Pick add or skip.' };

  const rows = (await query<{ id: number; client_id: number; name: string; phone: string; email: string; about: string; website: string; address: string; rating: number | null; reviews: number | null }>(
    "SELECT id, client_id, name, phone, email, about, website, address, rating, reviews FROM candidates WHERE id = ANY($1) AND status = 'found'", [ids])).rows;
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
      `INSERT INTO leads (client_id, name, phone, email, source, need, notes, received_on, assignee_id, address, rating, reviews)
       VALUES ($1, $2, $3, $4, 'Research', '', $5, $6, $7, $8, $9, $10) RETURNING id`,
      [c.client_id, c.name, c.phone, c.email, notes, today(), user.id, c.address, c.rating, c.reviews]);
    await query("UPDATE candidates SET status = 'added', lead_id = $2 WHERE id = $1", [c.id, lead.rows[0].id]);
    added++;
  }
  revalidatePath('/find');
  revalidatePath('/leads');
  return done(`${added} added to prospects${blocked ? `; ${blocked} could not be (no contact details, or asked not to be contacted)` : ''}`);
  return {};
}
