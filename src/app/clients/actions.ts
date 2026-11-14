'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { parseBaselineForm, parseClientForm } from '@/lib/clients';

type Result = { error?: string };

// Column names below come from our own parse functions, never from the form, so building SQL from them is safe.

export async function createClient(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const { errors, values: v } = parseClientForm(formData, { includeTerms: user.role === 'owner' });
  if (errors.length) return { error: errors.join(' ') };
  const cols = Object.keys(v);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO clients (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(v),
  );
  revalidatePath('/');
  redirect(`/clients/${rows[0].id}?saved=Client+added`);
}

export async function updateClient(id: number, formData: FormData): Promise<Result> {
  const user = await requireUser();
  // Only the owner sees or changes deal terms; a team member's save never touches them.
  const { errors, values: v } = parseClientForm(formData, { includeTerms: user.role === 'owner' });
  if (errors.length) return { error: errors.join(' ') };
  const cols = Object.keys(v);
  await query(
    `UPDATE clients SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
    [...Object.values(v), id],
  );
  revalidatePath('/');
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}/settings?saved=Client+saved#details-h`);
}

export async function saveBaseline(id: number, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const { errors, values: v } = parseBaselineForm(formData);
  if (errors.length) return { error: errors.join(' ') };
  // A signed-off baseline is what the growth bonus is measured against; after sign-off only the owner may change it.
  const existing = await query<{ signed_off: boolean }>('SELECT signed_off FROM baselines WHERE client_id = $1', [id]);
  if (existing.rows[0]?.signed_off && user.role !== 'owner') {
    return { error: 'This baseline is signed off. Only the owner can change it.' };
  }
  const cols = Object.keys(v);
  await query(
    `INSERT INTO baselines (client_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (client_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
    [id, ...Object.values(v)],
  );
  revalidatePath('/');
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?saved=Baseline+saved`);
}
