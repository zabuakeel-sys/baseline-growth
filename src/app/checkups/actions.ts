'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { AREAS, readAnswers } from '@/lib/checkup';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveCheckup(clientId: number, formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  const exists = await query('SELECT 1 FROM clients WHERE id = $1', [clientId]);
  if (!exists.rowCount) return { error: 'That client no longer exists.' };

  const { answers, missing } = readAnswers((name) => formData.get(name));
  if (missing.length) {
    return { error: `Rate every statement before saving. ${missing.length} still blank, starting with: "${missing[0]}"` };
  }
  const conductedOn = String(formData.get('conducted_on') ?? '').trim();
  if (!DATE.test(conductedOn)) return { error: 'Pick the date of the checkup.' };

  const notes: Record<string, string> = {};
  for (const area of AREAS) {
    const text = String(formData.get(`notes_${area.key}`) ?? '').trim();
    if (text) notes[area.key] = text;
  }
  const summary = String(formData.get('summary') ?? '').trim();

  const { rows } = await query<{ id: number }>(
    `INSERT INTO checkups (client_id, conducted_on, conducted_by, answers, notes, summary)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [clientId, conductedOn, user.id, JSON.stringify(answers), JSON.stringify(notes), summary],
  );
  revalidatePath(`/clients/${clientId}`);
  redirect(`/checkups/${rows[0].id}`);
}
