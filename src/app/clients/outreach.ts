'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

type Result = { error?: string };
const safe = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/');

/** The owner read the business's first email and approved it: its schedule now sends on its own. */
export async function approveOutreach(clientId: number, back: string): Promise<Result> {
  await requireOwner();
  const c = (await query<{ mailing_address: string; offer: string }>('SELECT mailing_address, offer FROM clients WHERE id = $1', [clientId])).rows[0];
  if (!c) return { error: 'That business no longer exists.' };
  if (!c.mailing_address || !c.offer) return { error: 'Finish the answers first (the offer and mailing address are in every email).' };
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
