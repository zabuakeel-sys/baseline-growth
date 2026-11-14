'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner, requireUser } from '@/lib/auth';
import { monthOf } from '@/lib/billing';
import { parseDollarsToCents, parseWholeNumber } from '@/lib/money';

type Result = { error?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function refresh(clientId: number) {
  revalidatePath('/');
  revalidatePath('/work');
  revalidatePath('/money');
  revalidatePath(`/clients/${clientId}`);
}


export async function addTask(clientId: number, formData: FormData): Promise<Result> {
  await requireUser();
  const title = String(formData.get('title') ?? '').trim();
  const due = String(formData.get('due_on') ?? '').trim();
  const assignee = parseWholeNumber(formData.get('assignee_id'));
  const area = String(formData.get('area') ?? '').trim();
  if (!title) return { error: 'Write what needs doing.' };
  if (due && !DATE.test(due)) return { error: 'Due date must be a date.' };
  if (Number.isNaN(assignee)) return { error: 'Pick who does it.' };
  await query('INSERT INTO tasks (client_id, title, area, assignee_id, due_on) VALUES ($1, $2, $3, $4, $5)',
    [clientId, title, area, assignee, due || null]);
  refresh(clientId);
  redirect(`/clients/${clientId}/prospects?saved=Task+added#tasks-h`);
}

/** Marks a task done or reopens it. Plain form post, so it works with one tap. */
export async function toggleTask(taskId: number, back: string) {
  await requireUser();
  const { rows } = await query<{ client_id: number }>(
    'UPDATE tasks SET done_at = CASE WHEN done_at IS NULL THEN now() ELSE NULL END WHERE id = $1 RETURNING client_id', [taskId]);
  if (rows[0]) refresh(rows[0].client_id);
  redirect(back.startsWith('/') ? back : '/work');
}

export async function saveResult(clientId: number, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const monthInput = String(formData.get('month') ?? '').trim();
  if (!MONTH.test(monthInput)) return { error: 'Pick the month these numbers are for.' };
  const month = `${monthInput}-01`;
  const revenue = parseDollarsToCents(formData.get('revenue'));
  if (revenue === null || Number.isNaN(revenue)) return { error: 'Revenue for the month is required, as a dollar amount.' };
  const inquiries = parseWholeNumber(formData.get('inquiries'));
  const customers = parseWholeNumber(formData.get('new_customers'));
  if (Number.isNaN(inquiries) || Number.isNaN(customers)) return { error: 'Inquiries and new customers must be whole numbers.' };
  const confirmed = formData.get('confirmed') === 'on';
  const confirmedBy = String(formData.get('confirmed_by') ?? '').trim();
  if (confirmed && !confirmedBy) return { error: 'Say who at the client confirmed these numbers.' };
  const notes = String(formData.get('notes') ?? '').trim();

  // Confirmed numbers decide the growth bonus, so after confirmation only the owner may change them.
  const existing = await query<{ confirmed: boolean }>(
    'SELECT confirmed FROM monthly_results WHERE client_id = $1 AND month = $2', [clientId, month]);
  if (existing.rows[0]?.confirmed && user.role !== 'owner') {
    return { error: 'These numbers are confirmed by the client. Only the owner can change them.' };
  }
  await query(
    `INSERT INTO monthly_results (client_id, month, revenue_cents, inquiries, new_customers, notes, confirmed, confirmed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (client_id, month) DO UPDATE SET revenue_cents = EXCLUDED.revenue_cents, inquiries = EXCLUDED.inquiries,
       new_customers = EXCLUDED.new_customers, notes = EXCLUDED.notes, confirmed = EXCLUDED.confirmed,
       confirmed_by = EXCLUDED.confirmed_by, updated_at = now()`,
    [clientId, month, revenue, inquiries, customers, notes, confirmed, confirmedBy],
  );
  refresh(clientId);
  redirect(`/clients/${clientId}?saved=Results+saved#results-h`);
}

export async function recordPayment(formData: FormData): Promise<Result> {
  await requireOwner();
  const clientId = parseWholeNumber(formData.get('client_id'));
  const monthInput = String(formData.get('month') ?? '').trim();
  const amount = parseDollarsToCents(formData.get('amount'));
  const receivedOn = String(formData.get('received_on') ?? '').trim();
  if (!clientId) return { error: 'Pick the client who paid.' };
  if (!MONTH.test(monthInput)) return { error: 'Pick the month the payment is for.' };
  if (!amount || Number.isNaN(amount)) return { error: 'Amount must be a dollar amount above zero.' };
  if (!DATE.test(receivedOn)) return { error: 'Pick the date it was received.' };
  await query('INSERT INTO payments (client_id, month, amount_cents, received_on, note) VALUES ($1, $2, $3, $4, $5)',
    [clientId, monthOf(`${monthInput}-01`), amount, receivedOn, String(formData.get('note') ?? '').trim()]);
  refresh(clientId);
  redirect('/money?saved=1');
}
