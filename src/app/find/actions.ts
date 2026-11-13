'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { placesConfigured } from '@/lib/places';
import { addCandidates, runSearch } from '@/lib/finderRun';
import { parseWholeNumber } from '@/lib/money';

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

/** Runs one saved search now, from the Find page. */
export async function runTarget(targetId: number): Promise<Result> {
  await requireUser();
  if (!placesConfigured()) return { error: 'The business search is not connected yet. Add GOOGLE_PLACES_API_KEY in Railway first.' };
  let r;
  try {
    r = await runSearch(targetId);
  } catch (err) {
    return { error: `The business search failed: ${(err as Error).message}` };
  }
  revalidatePath('/find');
  return done(`Found ${r.found} businesses; ${r.added} new ones are ready for review`);
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

  const { added, blocked } = await addCandidates(ids, () => user.id);
  revalidatePath('/find');
  revalidatePath('/leads');
  return done(`${added} added to prospects${blocked ? `; ${blocked} could not be (no contact details, or asked not to be contacted)` : ''}`);
  return {};
}
