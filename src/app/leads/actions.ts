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
const MONTH = /^\d{4}-\d{2}$/;
const safeBack = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/leads');
const withSaved = (back: string, msg: string) => {
  const [path, hash] = safeBack(back).split('#');
  return `${path}${path.includes('?') ? '&' : '?'}saved=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`;
};

function refresh(clientId: number) {
  revalidatePath('/leads');
  revalidatePath('/money');
  revalidatePath(`/clients/${clientId}`);
}

async function update(sql: string, params: unknown[]) {
  const { rows } = await query<{ client_id: number }>(sql, params);
  if (rows[0]) refresh(rows[0].client_id);
  return rows[0] ?? null;
}

/** Adds a prospect we will reach for a client. */
export async function addLead(clientId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const source = String(formData.get('source') ?? '').trim();
  const need = String(formData.get('need') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim().slice(0, 300);
  const assignee = parseWholeNumber(formData.get('assignee_id'));
  const client = await query('SELECT 1 FROM clients WHERE id = $1', [clientId]);
  if (!client.rowCount) return { error: 'That client no longer exists.' };
  if (!name) return { error: 'Add a name or business name.' };
  if (!phone && !email) return { error: 'Add a phone number or an email so they can be reached.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email does not look right.' };
  if (source && !SOURCES.includes(source)) return { error: 'Pick where this prospect came from.' };
  if (Number.isNaN(assignee)) return { error: 'Pick who reaches out.' };
  // Anyone who asked not to be contacted, for any client, stays off every list.
  if (email || phone) {
    const blocked = await query(
      `SELECT 1 FROM leads WHERE status = 'opted_out' AND ((email <> '' AND email = $1) OR (phone <> '' AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')))`,
      [email, phone]);
    if (blocked.rowCount) return { error: `${name} asked not to be contacted. They cannot be added again.` };
    const dup = await query(
      `SELECT 1 FROM leads WHERE client_id = $1 AND status NOT IN ('lost') AND ((email <> '' AND email = $2) OR (phone <> '' AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($3, '\\D', '', 'g')))`,
      [clientId, email, phone]);
    if (dup.rowCount) return { error: `${name} is already on this client's list.` };
  }
  await query(
    `INSERT INTO leads (client_id, name, phone, email, source, need, received_on, assignee_id, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [clientId, name, phone, email, source, need, today(), assignee, address],
  );
  refresh(clientId);
  redirect(withSaved(back, `${name} added`));
}

/** Records that the next scheduled message went out. */
export async function markSent(leadId: number, back: string) {
  await requireUser();
  await update(
    `UPDATE leads SET touches_sent = LEAST(touches_sent + 1, $2), status = 'following_up',
       first_touch_at = COALESCE(first_touch_at, now()), last_touch_at = now()
     WHERE id = $1 AND status IN ('new', 'following_up') RETURNING client_id`,
    [leadId, SCHEDULE_DAYS.length]);
  redirect(safeBack(back));
}

/** They answered: the sequence stops and a person takes the conversation. */
export async function markReplied(leadId: number, back: string) {
  await requireUser();
  await update(`UPDATE leads SET status = 'talking' WHERE id = $1 AND status IN ('new', 'following_up') RETURNING client_id`, [leadId]);
  redirect(safeBack(back));
}

/** Handed to the client: the record that this customer came from us starts here. */
export async function markIntroduced(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const on = String(formData.get('introduced_on') ?? '').trim() || today();
  if (!DATE.test(on) || on > today()) return { error: 'The introduction date must be today or earlier.' };
  await update(
    `UPDATE leads SET status = 'introduced', introduced_on = $2
     WHERE id = $1 AND status IN ('new', 'following_up', 'talking') RETURNING client_id`, [leadId, on]);
  redirect(withSaved(back, 'Introduced to the client'));
}

/** The client confirms they bought: from this month on, we share in what they pay. */
export async function markCustomer(leadId: number, back: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const since = String(formData.get('customer_since') ?? '').trim();
  if (!DATE.test(since) || since > today()) return { error: 'Pick the date they became a customer, today or earlier.' };
  const row = await update(
    `UPDATE leads SET status = 'won', customer_since = $2, closed_on = $2, lost_reason = '',
       introduced_on = COALESCE(introduced_on, $2), won_by = COALESCE(assignee_id, $3), next_action_on = NULL, next_action = ''
     WHERE id = $1 AND status IN ('new', 'following_up', 'talking', 'introduced') RETURNING client_id`, [leadId, since, user.id]);
  if (!row) return { error: 'This prospect is already closed.' };
  redirect(withSaved(back, 'New customer recorded'));
}

export async function markLost(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const reason = String(formData.get('lost_reason') ?? '');
  if (!LOST_REASONS.includes(reason)) return { error: 'Pick why it was lost. That is how we learn what to fix.' };
  await update(
    `UPDATE leads SET status = 'lost', lost_reason = $2, closed_on = $3
     WHERE id = $1 AND status <> 'won' RETURNING client_id`, [leadId, reason, today()]);
  redirect(safeBack(back));
}

/** They asked not to be contacted. Final: never contacted again, for any client. */
export async function markOptedOut(leadId: number, back: string) {
  await requireUser();
  await update(
    `UPDATE leads SET status = 'opted_out', closed_on = $2 WHERE id = $1 AND status <> 'won' RETURNING client_id`, [leadId, today()]);
  redirect(withSaved(back, 'Marked do not contact'));
}

/** Puts a lost or talking prospect back into the outreach sequence where it left off. Never an opted-out one. */
export async function reopenLead(leadId: number, back: string) {
  await requireUser();
  await update(
    `UPDATE leads SET status = CASE WHEN touches_sent = 0 THEN 'new' ELSE 'following_up' END, lost_reason = '', closed_on = NULL
     WHERE id = $1 AND status IN ('lost', 'talking', 'introduced') RETURNING client_id`, [leadId]);
  redirect(safeBack(back));
}

/** What a customer we brought paid the client in a month, as the client reports it. */
export async function saveCustomerRevenue(leadId: number, back: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const monthInput = String(formData.get('month') ?? '').trim();
  if (!MONTH.test(monthInput)) return { error: 'Pick the month.' };
  const month = `${monthInput}-01`;
  const revenue = parseDollarsToCents(formData.get('revenue'));
  if (revenue === null || Number.isNaN(revenue)) return { error: 'Enter what they paid that month, as a dollar amount.' };
  const confirmed = formData.get('confirmed') === 'on';
  const confirmedBy = String(formData.get('confirmed_by') ?? '').trim();
  if (confirmed && !confirmedBy) return { error: 'Say who at the client confirmed this amount.' };
  const lead = (await query<{ client_id: number; customer_since: string | null }>(
    "SELECT client_id, customer_since FROM leads WHERE id = $1 AND status = 'won'", [leadId])).rows[0];
  if (!lead) return { error: 'This is not a customer yet.' };
  if (lead.customer_since && month < `${lead.customer_since.slice(0, 7)}-01`) {
    return { error: 'That month is before they became a customer.' };
  }
  // Confirmed amounts decide what we bill, so after confirmation only the owner may change them.
  const existing = await query<{ confirmed: boolean }>(
    'SELECT confirmed FROM customer_revenue WHERE lead_id = $1 AND month = $2', [leadId, month]);
  if (existing.rows[0]?.confirmed && user.role !== 'owner') {
    return { error: 'This amount is confirmed by the client. Only the owner can change it.' };
  }
  await query(
    `INSERT INTO customer_revenue (lead_id, month, revenue_cents, confirmed, confirmed_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lead_id, month) DO UPDATE SET revenue_cents = EXCLUDED.revenue_cents, confirmed = EXCLUDED.confirmed,
       confirmed_by = EXCLUDED.confirmed_by, updated_at = now()`,
    [leadId, month, revenue, confirmed, confirmedBy]);
  refresh(lead.client_id);
  redirect(withSaved(back, 'Revenue saved'));
}
