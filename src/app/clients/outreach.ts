'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { starterEmail } from '@/lib/setup';
import { outreachAccount, sendMail } from '@/lib/mail';
import { fillEmail, ensureFooter } from '@/lib/followup';
import { toHtml } from '@/lib/emailhtml';

type Result = { error?: string; field?: string };
const safe = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/');

/**
 * Sends the first email to the owner's own inbox so they can see exactly what a prospect gets, with
 * the logo and layout. This is a real send through the connected mailbox, so it also proves sending
 * works end to end.
 */
export async function sendTestOutreach(clientId: number, back: string): Promise<Result> {
  const user = await requireOwner();
  const found = await getClient(clientId);
  if (!found) return { error: 'That business no longer exists.' };
  const c = found.client;
  const account = await outreachAccount(clientId);
  if (!account) return { error: 'Connect a sending mailbox first on the Automatic emailing page.' };
  const to = (await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [user.id])).rows[0]?.email;
  if (!to) return { error: 'Your account has no email to send the test to.' };
  const draft = await starterEmail(c);
  const ctx = { firstName: '', name: 'Sample Shop', city: 'Troy', clientName: c.name, claimUrl: c.claim_url, address: c.mailing_address };
  const subject = `[Test] ${fillEmail(draft.subject, ctx, false).replace(/\n+/g, ' ').trim()}`;
  const text = ensureFooter(fillEmail(draft.body, ctx), { address: c.mailing_address });
  const html = toHtml(text, { logoUrl: c.logo_url, clientName: c.name });
  try {
    await sendMail({ to, subject, text, html }, account);
  } catch (err) {
    return { error: `Could not send the test: ${(err as Error).message}` };
  }
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent(`Test email sent to ${to}. Check your inbox and your spam folder`)}${hash ? `#${hash}` : ''}`);
}

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
  // Approving is the last setup step, so go to the business page, where the work list starts.
  void back;
  redirect(`/clients/${clientId}?saved=${encodeURIComponent('Approved. Emails now send on their own')}`);
}

export async function pauseOutreach(clientId: number, back: string): Promise<Result> {
  await requireOwner();
  await query('UPDATE clients SET outreach_approved_at = NULL WHERE id = $1', [clientId]);
  await query("UPDATE outbox SET status = 'pending', approved_at = NULL WHERE client_id = $1 AND kind = 'sequence' AND status = 'approved'", [clientId]);
  for (const p of ['/', '/clients', `/clients/${clientId}`, '/outbox']) revalidatePath(p);
  const [path, hash] = safe(back).split('#');
  redirect(`${path}?saved=${encodeURIComponent('Paused. New emails for this business wait for approval again')}${hash ? `#${hash}` : ''}`);
}
