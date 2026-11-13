'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { LOST_REASONS, SCHEDULE_DAYS, SOURCES } from '@/lib/followup';
import { parseDollarsToCents, parseWholeNumber } from '@/lib/money';
import { today } from '@/lib/work';

type Result = { error?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const safeBack = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/leads');

function refresh(clientId: number) {
  revalidatePath('/leads');
  revalidatePath(`/clients/${clientId}`);
}

export async function addLead(clientId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const source = String(formData.get('source') ?? '').trim();
  const need = String(formData.get('need') ?? '').trim();
  const receivedOn = String(formData.get('received_on') ?? '').trim() || today();
  const assignee = parseWholeNumber(formData.get('assignee_id'));
  const client = await query('SELECT 1 FROM clients WHERE id = $1', [clientId]);
  if (!client.rowCount) return { error: 'That client no longer exists.' };
  if (!name) return { error: 'Who is the inquiry from? A name or business name is required.' };
  if (!phone && !email) return { error: 'Add a phone number or an email so they can be followed up.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email does not look right.' };
  if (source && !SOURCES.includes(source)) return { error: 'Pick where the inquiry came from.' };
  if (!DATE.test(receivedOn) || receivedOn > today()) return { error: 'The date it came in must be today or earlier.' };
  if (Number.isNaN(assignee)) return { error: 'Pick who follows up.' };
  await query(
    `INSERT INTO leads (client_id, name, phone, email, source, need, received_on, assignee_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [clientId, name, phone, email, source, need, receivedOn, assignee],
  );
  refresh(clientId);
  redirect(`${safeBack(back)}${back.includes('?') ? '&' : '?'}saved=${encodeURIComponent(`Inquiry from ${name} added`)}`);
}

/** Records that the next scheduled message went out. */
export async function markSent(leadId: number, back: string) {
  await requireUser();
  const { rows } = await query<{ client_id: number }>(
    `UPDATE leads SET touches_sent = LEAST(touches_sent + 1, $2), status = 'following_up',
       first_touch_at = COALESCE(first_touch_at, now()), last_touch_at = now()
     WHERE id = $1 AND status IN ('new', 'following_up') RETURNING client_id`,
    [leadId, SCHEDULE_DAYS.length],
  );
  if (rows[0]) refresh(rows[0].client_id);
  redirect(safeBack(back));
}

/** The lead answered: stop the automatic rhythm, a person takes it from here. */
export async function markReplied(leadId: number, back: string) {
  await requireUser();
  const { rows } = await query<{ client_id: number }>(
    `UPDATE leads SET status = 'talking', first_touch_at = COALESCE(first_touch_at, now())
     WHERE id = $1 AND status IN ('new', 'following_up') RETURNING client_id`, [leadId]);
  if (rows[0]) refresh(rows[0].client_id);
  redirect(safeBack(back));
}

export async function closeLead(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const outcome = String(formData.get('outcome') ?? '');
  if (outcome === 'won') {
    const value = parseDollarsToCents(formData.get('won_value'));
    if (Number.isNaN(value)) return { error: 'Sale value must be a dollar amount.' };
    const { rows } = await query<{ client_id: number }>(
      `UPDATE leads SET status = 'won', won_value_cents = $2, lost_reason = '', closed_on = $3 WHERE id = $1 RETURNING client_id`,
      [leadId, value, today()]);
    if (rows[0]) refresh(rows[0].client_id);
  } else if (outcome === 'lost') {
    const reason = String(formData.get('lost_reason') ?? '');
    if (!LOST_REASONS.includes(reason)) return { error: 'Pick why it was lost. That is how we learn what to fix.' };
    const { rows } = await query<{ client_id: number }>(
      `UPDATE leads SET status = 'lost', lost_reason = $2, won_value_cents = NULL, closed_on = $3 WHERE id = $1 RETURNING client_id`,
      [leadId, reason, today()]);
    if (rows[0]) refresh(rows[0].client_id);
  } else {
    return { error: 'Pick won or lost.' };
  }
  redirect(safeBack(back));
}

/** Puts a closed or talking lead back into the follow-up rhythm where it left off. */
export async function reopenLead(leadId: number, back: string) {
  await requireUser();
  const { rows } = await query<{ client_id: number }>(
    `UPDATE leads SET status = CASE WHEN touches_sent = 0 THEN 'new' ELSE 'following_up' END,
       won_value_cents = NULL, lost_reason = '', closed_on = NULL
     WHERE id = $1 RETURNING client_id`, [leadId]);
  if (rows[0]) refresh(rows[0].client_id);
  redirect(safeBack(back));
}
