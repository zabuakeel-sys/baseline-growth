'use server';
import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner, requireUser } from '@/lib/auth';
import { parsePricingLines, quote } from '@/lib/playbook';
import { formatCents, parseDollarsToCents, parsePercent, parseWholeNumber } from '@/lib/money';
import { today } from '@/lib/work';

type Result = { error?: string };
const safe = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/today');
const withSaved = (back: string, msg: string) => {
  const [path, hash] = safe(back).split('#');
  return `${path}${path.includes('?') ? '&' : '?'}saved=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`;
};
const refresh = (clientId?: number) => {
  for (const p of ['/today', '/leads', '/partners', '/insights']) revalidatePath(p);
  if (clientId) revalidatePath(`/clients/${clientId}`);
};

/** Claim link and pricing rules for a client. */
export async function saveRepTools(clientId: number, formData: FormData): Promise<Result> {
  await requireUser();
  const claimUrl = String(formData.get('claim_url') ?? '').trim();
  const claimLabel = String(formData.get('claim_label') ?? '').trim().slice(0, 60);
  if (claimUrl) {
    try {
      const u = new URL(claimUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    } catch {
      return { error: 'The claim or booking link must be a full web address starting with https://' };
    }
  }
  const { types, errors } = parsePricingLines(String(formData.get('pricing_lines') ?? ''));
  if (errors.length) return { error: errors[0] };
  const minimum = parseDollarsToCents(formData.get('pricing_minimum'));
  const range = parsePercent(formData.get('pricing_range'));
  if (Number.isNaN(minimum)) return { error: 'Minimum monthly price must be a dollar amount.' };
  if (Number.isNaN(range)) return { error: 'Price range must be a percent.' };
  const pricing = types.length ? { types, minimumCents: minimum ?? 0, rangePercent: range ?? 10 } : null;
  await query('UPDATE clients SET claim_url = $2, claim_label = $3, pricing = $4 WHERE id = $1',
    [clientId, claimUrl, claimLabel, pricing ? JSON.stringify(pricing) : null]);
  refresh(clientId);
  redirect(withSaved(`/clients/${clientId}/settings#tools-h`, 'Rep tools saved'));
}

/** Saves an instant quote on the prospect and in its notes, so the client sees what was quoted. */
export async function saveQuote(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const lead = (await query<{ client_id: number; pricing: Parameters<typeof quote>[0] }>(
    'SELECT l.client_id, c.pricing FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = $1', [leadId])).rows[0];
  if (!lead) return { error: 'That prospect no longer exists.' };
  const type = String(formData.get('type') ?? '');
  const sqft = parseWholeNumber(formData.get('sqft'));
  const visits = Number(formData.get('visits'));
  if (!sqft || Number.isNaN(sqft)) return { error: 'Enter the square footage.' };
  const q = quote(lead.pricing, { type, sqft, visitsPerWeek: visits });
  if (!q) return { error: 'Pick a building type and how often.' };
  const line = `${today()}: quoted ${formatCents(q.lowCents)} to ${formatCents(q.highCents)} a month (${type}, ${sqft.toLocaleString('en-US')} sq ft, ${visits}x a week)`;
  await query(`UPDATE leads SET quote_cents = $2, notes = CASE WHEN notes = '' THEN $3 ELSE notes || E'\\n' || $3 END WHERE id = $1`,
    [leadId, q.midCents, line]);
  refresh(lead.client_id);
  redirect(withSaved(back, 'Quote saved to the prospect'));
}

/** Records the referrals a new customer gave (or that they gave none). */
export async function addReferrals(leadId: number, back: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const src = (await query<{ client_id: number; name: string; status: string }>(
    'SELECT client_id, name, status FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!src) return { error: 'That customer no longer exists.' };
  let added = 0;
  for (const i of [1, 2, 3]) {
    const name = String(formData.get(`name${i}`) ?? '').trim().slice(0, 200);
    const phone = String(formData.get(`phone${i}`) ?? '').trim().slice(0, 40);
    const email = String(formData.get(`email${i}`) ?? '').trim().toLowerCase().slice(0, 200);
    if (!name && !phone && !email) continue;
    if (!name || (!phone && !email)) return { error: `Referral ${i} needs a name and a phone or email.` };
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: `Referral ${i}: that email does not look right.` };
    const blocked = await query(
      `SELECT 1 FROM leads WHERE status = 'opted_out' AND ((email <> '' AND email = $1) OR (phone <> '' AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')))`,
      [email, phone]);
    if (blocked.rowCount) continue;
    await query(
      `INSERT INTO leads (client_id, name, phone, email, source, need, received_on, assignee_id, referred_by, notes)
       VALUES ($1, $2, $3, $4, 'Referral', '', $5, $6, $7, $8)`,
      [src.client_id, name, phone, email, today(), user.id, leadId, `Referred by ${src.name}`]);
    added++;
  }
  await query('UPDATE leads SET referral_asked = true WHERE id = $1', [leadId]);
  refresh(src.client_id);
  redirect(withSaved(back, added ? `${added} referral${added === 1 ? '' : 's'} added as prospects` : 'Marked as asked'));
}

export async function addPartner(formData: FormData): Promise<Result> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  const clientId = parseWholeNumber(formData.get('client_id'));
  const fee = parseDollarsToCents(formData.get('fee'));
  const assignee = parseWholeNumber(formData.get('assignee_id'));
  if (!name) return { error: 'Name the partner business.' };
  if (Number.isNaN(clientId) || Number.isNaN(assignee)) return { error: 'Pick a client and a rep.' };
  if (Number.isNaN(fee)) return { error: 'Referral fee must be a dollar amount.' };
  const code = randomBytes(5).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x');
  await query(
    `INSERT INTO partners (client_id, name, kind, contact_name, email, phone, code, fee_cents, assignee_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [clientId, name, String(formData.get('kind') ?? '').trim(), String(formData.get('contact_name') ?? '').trim(),
      String(formData.get('email') ?? '').trim(), String(formData.get('phone') ?? '').trim(), code, fee ?? 0, assignee,
      String(formData.get('notes') ?? '').trim()]);
  refresh();
  redirect('/partners?saved=Partner+added');
}

export async function togglePartner(partnerId: number) {
  await requireUser();
  await query('UPDATE partners SET active = NOT active WHERE id = $1', [partnerId]);
  refresh();
  redirect('/partners');
}

export async function setGoals(userId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  const calls = parseWholeNumber(formData.get('goal_calls'));
  const visits = parseWholeNumber(formData.get('goal_visits'));
  const meetings = parseWholeNumber(formData.get('goal_meetings'));
  if ([calls, visits, meetings].some((n) => Number.isNaN(n))) return { error: 'Goals must be whole numbers.' };
  await query('UPDATE users SET goal_calls = $2, goal_visits = $3, goal_meetings = $4 WHERE id = $1',
    [userId, calls ?? 0, visits ?? 0, meetings ?? 0]);
  revalidatePath('/team');
  revalidatePath('/today');
  redirect('/team?saved=1');
}
