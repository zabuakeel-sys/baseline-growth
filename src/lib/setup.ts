// Where each business is in getting set up, as steps the owner is guided through, in order.
import { query } from './db';
import type { Client } from './clients';
import { missingAnswers } from './onboarding';
import { sharedAccount } from './mail';
import { messageFor } from './followup';

export type SetupStep = { key: 'answers' | 'mailbox' | 'approve' | 'live'; label: string; done: boolean; href: string; action: string };

export async function setupSteps(c: Client): Promise<SetupStep[]> {
  const a = (c.onboarding ?? {}) as Record<string, unknown>;
  const answersDone = Boolean(c.onboarding) && missingAnswers((k) => a[k]).length === 0;
  const box = (await query<{ verified: boolean }>('SELECT verified_at IS NOT NULL AS verified FROM client_mailboxes WHERE client_id = $1', [c.id])).rows[0];
  const mailboxDone = Boolean(box?.verified) || (!box && Boolean(sharedAccount()));
  const live = (await query<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE client_id = $1 AND status = 'sent'", [c.id])).rows[0].n > 0;
  return [
    { key: 'answers', label: 'Answers', done: answersDone, href: `/clients/${c.id}/setup`, action: 'Finish the owner\'s answers' },
    { key: 'mailbox', label: 'Mailbox', done: mailboxDone, href: `/clients/${c.id}#mailbox-h`, action: box ? 'Test the mailbox connection' : 'Connect their outreach mailbox' },
    { key: 'approve', label: 'Approve first email', done: Boolean(c.outreach_approved_at), href: `/clients/${c.id}#approve-h`, action: c.mailing_address ? 'Read and approve their first email' : 'Add a mailing address, then approve their first email' },
    { key: 'live', label: 'Live', done: live && Boolean(c.outreach_approved_at), href: `/clients/${c.id}`, action: 'Waiting for the first email to go out' },
  ];
}

/** The email to approve: the first one actually queued for this business, or a sample built the same way. */
export async function sampleFirstEmail(c: Client) {
  const queued = (await query<{ subject: string; body: string; lead_name: string }>(
    `SELECT o.subject, o.body, l.name AS lead_name FROM outbox o JOIN leads l ON l.id = o.lead_id
     WHERE o.client_id = $1 AND o.kind = 'sequence' AND o.touch = 0 AND o.status IN ('pending', 'approved', 'sent') ORDER BY o.id LIMIT 1`, [c.id])).rows[0];
  if (queued) return { ...queued, real: true };
  const sender = (await query<{ from_name: string }>('SELECT from_name FROM client_mailboxes WHERE client_id = $1', [c.id])).rows[0]?.from_name ?? '';
  return {
    subject: `Quick question from ${c.name}`, lead_name: 'Pat Example', real: false,
    body: messageFor(0, { leadName: 'Pat Example', clientName: c.name, offer: c.offer, senderName: sender, address: c.mailing_address }),
  };
}
