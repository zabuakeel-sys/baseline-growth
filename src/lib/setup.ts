// Where each business is in getting set up, as steps the owner is guided through, in order.
import { query } from './db';
import type { Client } from './clients';
import { missingAnswers } from './onboarding';
import { sharedAccount } from './mail';
import { messageFor, signOff } from './followup';
import { writeOutreachEmail } from './coach';

export type SetupStep = { key: 'answers' | 'mailbox' | 'approve' | 'live'; label: string; done: boolean; href: string; action: string };

export async function setupSteps(c: Client): Promise<SetupStep[]> {
  const a = (c.onboarding ?? {}) as Record<string, unknown>;
  const answersDone = Boolean(c.onboarding) && missingAnswers((k) => a[k]).length === 0;
  const box = (await query<{ verified: boolean }>('SELECT verified_at IS NOT NULL AS verified FROM client_mailboxes WHERE client_id = $1', [c.id])).rows[0];
  // Done when a tested mailbox of its own exists, or the shared Baseline Growth mailbox is set up.
  // A half-set-up/broken mailbox is ignored, since outreach falls back to the shared mailbox.
  const mailboxDone = Boolean(box?.verified) || Boolean(sharedAccount());
  const live = (await query<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE client_id = $1 AND status = 'sent'", [c.id])).rows[0].n > 0;
  return [
    { key: 'answers', label: 'Answers', done: answersDone, href: `/clients/${c.id}/setup`, action: 'Finish the owner\'s answers' },
    { key: 'mailbox', label: 'Mailbox', done: mailboxDone, href: `/clients/${c.id}#mailbox-h`, action: 'Add the shared Baseline Growth mailbox, or connect one for this business' },
    { key: 'approve', label: 'Approve first email', done: Boolean(c.outreach_approved_at), href: `/clients/${c.id}#approve-h`, action: c.mailing_address ? 'Read and approve their first email' : 'Add a mailing address, then approve their first email' },
    { key: 'live', label: 'Live', done: live && Boolean(c.outreach_approved_at), href: `/clients/${c.id}`, action: 'Waiting for the first email to go out' },
  ];
}

const TOKEN = 'XFIRSTNAMEX';

/**
 * The editable starting draft of the first email (subject + body), with {first_name} where the
 * prospect's name goes. The owner's saved email if there is one, else an AI draft, else a template.
 * No signature/opt-out here; those are added automatically when sending.
 */
export async function starterEmail(c: Client): Promise<{ subject: string; body: string; source: 'saved' | 'ai' | 'template' }> {
  if (c.outreach_subject.trim() && c.outreach_body.trim()) {
    return { subject: c.outreach_subject, body: c.outreach_body, source: 'saved' };
  }
  const written = await writeOutreachEmail({
    leadName: TOKEN, about: '', need: '', city: '', rating: null, reviews: null,
    clientName: c.name, offer: c.offer, whyUs: c.why_us, firstStep: c.first_step, claimUrl: c.claim_url, goal: c.goal, touch: 0,
  });
  const token = new RegExp(TOKEN, 'gi');
  if (written) return { subject: written.subject.replace(token, '{first_name}'), body: written.body.replace(token, '{first_name}'), source: 'ai' };
  // No AI: a plain editable first-contact starter, with placeholders the owner can keep or change.
  const ask = c.first_step ? c.first_step.replace(/[.\s]+$/, '') : 'get started';
  const link = c.claim_url ? `\n\n[${ask}]` : '';
  const body = `Hi [First name],\n\n${c.offer || `I'm reaching out from ${c.name}.`} I don't think [Shop Name] is set up with us yet.`
    + `\n\nIf you'd like this for your shop, you can ${ask} here:${link || ` just reply and I'll send the details.`}`
    + `\n\nIf someone else handles this, feel free to forward it to them.`;
  return { subject: `Claim your free ${c.name} account`, body, source: 'template' };
}

/** The email to approve: the first one actually queued for this business, or an AI-written sample. */
export async function sampleFirstEmail(c: Client) {
  const queued = (await query<{ subject: string; body: string; lead_name: string }>(
    `SELECT o.subject, o.body, l.name AS lead_name FROM outbox o JOIN leads l ON l.id = o.lead_id
     WHERE o.client_id = $1 AND o.kind = 'sequence' AND o.touch = 0 AND o.status IN ('pending', 'approved', 'sent') ORDER BY o.id LIMIT 1`, [c.id])).rows[0];
  if (queued) return { ...queued, real: true };
  const sender = (await query<{ from_name: string }>('SELECT from_name FROM client_mailboxes WHERE client_id = $1', [c.id])).rows[0]?.from_name ?? '';
  // Show what the live emails actually look like: AI-written toward the goal, when AI is connected.
  const written = await writeOutreachEmail({
    leadName: 'Pat Example', about: '', need: '', city: '', rating: null, reviews: null,
    clientName: c.name, offer: c.offer, whyUs: c.why_us, firstStep: c.first_step, claimUrl: c.claim_url, goal: c.goal, touch: 0,
  });
  return {
    subject: written ? written.subject : `Quick question from ${c.name}`, lead_name: 'Pat Example', real: false,
    body: written
      ? written.body + signOff({ clientName: c.name, senderName: sender, address: c.mailing_address })
      : messageFor(0, { leadName: 'Pat Example', clientName: c.name, offer: c.offer, senderName: sender, address: c.mailing_address }),
  };
}
