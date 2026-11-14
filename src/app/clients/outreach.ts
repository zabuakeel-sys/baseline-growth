'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

type Result = { error?: string; field?: string };
const safe = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/');

/** Saves the owner's perfected first email (subject + body). Does not start sending. */
export async function saveOutreachEmail(clientId: number, back: string, formData: FormData): Promise<Result> {
  await requireOwner();
  const subject = String(formData.get('subject') ?? '').replace(/\s+/g, ' ').trim();
  const bodyRaw = String(formData.get('body') ?? '').replace(/\r\n/g, '\n').trim();
  if (subject.length < 3) return { error: 'Write a subject line.', field: 'subject' };
  if (subject.length > 150) return { error: 'The subject is too long.', field: 'subject' };
  if (bodyRaw.length < 20) return { error: 'Write the email.', field: 'body' };
  if (bodyRaw.length > 6000) return { error: 'The email is too long.', field: 'body' };
  await query('UPDATE clients SET outreach_subject = $2, outreach_body = $3 WHERE id = $1', [clientId, subject, bodyRaw]);
  for (const p of ['/', '/clients', `/clients/${clientId}`]) revalidatePath(p);
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent('Email saved. Read it once more, then start sending when it is perfect')}${hash ? `#${hash}` : ''}`);
}

/** Clears the saved custom email, so AI (or the template) writes it again. */
export async function resetOutreachEmail(clientId: number, back: string): Promise<Result> {
  await requireOwner();
  await query("UPDATE clients SET outreach_subject = '', outreach_body = '' WHERE id = $1", [clientId]);
  for (const p of ['/', '/clients', `/clients/${clientId}`]) revalidatePath(p);
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent('Reset to an auto-written draft')}${hash ? `#${hash}` : ''}`);
}

/** The owner read the business's first email and approved it: its schedule now sends on its own. */
export async function approveOutreach(clientId: number, back: string): Promise<Result> {
  await requireOwner();
  const c = (await query<{ mailing_address: string; offer: string; outreach_subject: string; outreach_body: string }>(
    'SELECT mailing_address, offer, outreach_subject, outreach_body FROM clients WHERE id = $1', [clientId])).rows[0];
  if (!c) return { error: 'That business no longer exists.' };
  if (!c.mailing_address || !c.offer) return { error: c.offer ? 'Add a mailing address on the business page first: US law requires one in every outreach email.' : 'Finish the answers first: the offer is in every email.' };
  if (!c.outreach_subject.trim() || !c.outreach_body.trim()) return { error: 'Write and save the first email before you start sending.' };
  await query('UPDATE clients SET outreach_approved_at = now() WHERE id = $1', [clientId]);
  await query("UPDATE outbox SET status = 'approved', approved_at = now() WHERE client_id = $1 AND kind = 'sequence' AND status = 'pending'", [clientId]);
  for (const p of ['/', '/clients', `/clients/${clientId}`, '/outbox']) revalidatePath(p);
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent('Approved. Outreach for this business now sends on its own')}${hash ? `#${hash}` : ''}`);
}

export async function pauseOutreach(clientId: number, back: string): Promise<Result> {
  await requireOwner();
  await query('UPDATE clients SET outreach_approved_at = NULL WHERE id = $1', [clientId]);
  await query("UPDATE outbox SET status = 'pending', approved_at = NULL WHERE client_id = $1 AND kind = 'sequence' AND status = 'approved'", [clientId]);
  for (const p of ['/', '/clients', `/clients/${clientId}`, '/outbox']) revalidatePath(p);
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent('Paused. New emails for this business wait for approval again')}${hash ? `#${hash}` : ''}`);
}
