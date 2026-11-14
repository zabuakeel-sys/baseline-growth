// The outreach engine. One run: queue the messages that are due, send the approved ones inside
// the limits, then read the mailboxes and act on replies. Runs every few minutes in the
// background (see src/instrumentation.ts) and on demand from the Outbox page.
//
// Each prospect follows the mixed schedule in cadence.js: emails are queued here and sent from the
// client's own mailbox (or the shared one); calls and visits go on the assigned rep's Today list.
import { pool, query } from './db';
import { ensureFooter, fillEmail, messageFor, signOff } from './followup';
import { CADENCE, currentStep, emailNumber, isMissed, isScheduleLabel, stepLabel } from './cadence';
import { toHtml } from './emailhtml';
import { addressOf, classifyReply, inSendWindow, remainingToday } from './mailrules';
import { type MailAccount, allClientAccounts, clientAccount, fetchUnread, outreachAccount, sendMail, sharedAccount } from './mail';
import { draftReply, writeOutreachEmail } from './coach';
import { cityOf } from './leads';
import { today } from './work';
import { runAutopilot } from './autopilotRun';

export type Settings = { auto_send: boolean; daily_limit: number; start_hour: number; end_hour: number; last_run_at: string | null; last_error: string; max_searches_per_day: number; last_autopilot: string };

export async function getSettings() {
  return (await query<Settings>('SELECT * FROM outreach_settings WHERE id = 1')).rows[0];
}

const subjectFor = (clientName: string, touch: number) =>
  `${touch === 0 ? '' : 'Re: '}Quick question from ${clientName}`;

/** The sender's display name ("Zaino" from "Zaino <z@x.com>"), used in the signature. */
const nameOf = (from: string) => from.replace(/<.*>/, '').replace(/"/g, '').trim();

type DueLead = {
  id: number; email: string; phone: string; address: string; name: string; need: string; notes: string; rating: number | null; reviews: number | null;
  received_on: string; touches_sent: number; status: string; cadence_step: number; next_action_on: string | null; next_action: string;
  client_id: number; client_name: string; offer: string; mailing_address: string; visits: boolean; approved: boolean;
  goal: string; outreach_subject: string; outreach_body: string; why_us: string; first_step: string; claim_url: string;
};

/**
 * Walks every open prospect through the schedule: queues the email that is due, puts the call or
 * visit that is due on the rep's list, and skips a call or visit nobody did within a few days.
 */
async function queueDue(settings: Settings) {
  const leads = (await query<DueLead>(
    `SELECT l.id, l.email, l.phone, l.address, l.name, l.need, l.notes, l.rating, l.reviews, l.received_on, l.touches_sent, l.status,
        l.cadence_step, l.next_action_on, l.next_action, l.client_id, c.name AS client_name, c.offer, c.mailing_address, c.visits, c.goal, c.outreach_subject, c.outreach_body, c.why_us, c.first_step, c.claim_url,
        c.outreach_approved_at IS NOT NULL AS approved
      FROM leads l JOIN clients c ON c.id = l.client_id
      WHERE l.status IN ('new', 'following_up') AND l.cadence_step < $1 AND c.status <> 'ended'`, [CADENCE.length])).rows;
  const now = today();
  const accounts = new Map<number, MailAccount | null>();
  let queued = 0;
  for (const l of leads) {
    // A few passes: skipping a missed call can make the next email due right away.
    for (let pass = 0; pass < CADENCE.length; pass++) {
      const step = currentStep(l, l, now);
      if (!step) break;
      if (step.channel === 'email') {
        // An email sent by hand from the Prospects page counts as this step done.
        if (l.touches_sent > emailNumber(step.index, l, l)) {
          l.cadence_step = step.index + 1;
          await query('UPDATE leads SET cadence_step = $2 WHERE id = $1', [l.id, l.cadence_step]);
          continue;
        }
        if (step.due > now || !l.mailing_address) break;
        if (!accounts.has(l.client_id)) accounts.set(l.client_id, await outreachAccount(l.client_id));
        const account = accounts.get(l.client_id);
        if (!account) break; // no mailbox: stays on the manual copy-and-send flow
        const exists = await query('SELECT 1 FROM outbox WHERE lead_id = $1 AND touch = $2', [l.id, l.touches_sent]);
        if (exists.rowCount) break;
        const first = l.touches_sent > 0
          ? (await query<{ message_id: string; subject: string }>("SELECT message_id, subject FROM outbox WHERE lead_id = $1 AND touch = 0 AND status = 'sent'", [l.id])).rows[0]
          : undefined;
        const senderName = account.senderName ?? nameOf(account.from);
        const sign = signOff({ clientName: l.client_name, senderName, address: l.mailing_address });
        let subject: string;
        let body: string;
        // The owner's perfected first email wins; otherwise AI writes one; otherwise the template.
        if (l.touches_sent === 0 && l.outreach_subject.trim() && l.outreach_body.trim()) {
          const ctx = { name: l.name, city: cityOf(l.address), clientName: l.client_name, claimUrl: l.claim_url, address: l.mailing_address };
          // The owner's subject is kept as written; the body is their email rewritten for this shop
          // (right name and city, same message), so no two prospects get the identical email. The
          // owner's own sign-off stays; only the legal opt-out + address are guaranteed.
          subject = fillEmail(l.outreach_subject, ctx).replace(/\n+/g, ' ').trim();
          const guide = fillEmail(l.outreach_body, ctx).replace(/\n+[^\n]*(unsubscribe|no thanks|rather not hear)[\s\S]*$/i, '').trim();
          const written = await writeOutreachEmail({
            leadName: l.name, about: l.notes, need: l.need, city: cityOf(l.address), rating: l.rating, reviews: l.reviews,
            clientName: l.client_name, offer: l.offer, whyUs: l.why_us, firstStep: l.first_step, claimUrl: l.claim_url, goal: l.goal, touch: 0, template: guide,
          });
          body = ensureFooter(written ? written.body : fillEmail(l.outreach_body, ctx), { address: l.mailing_address });
        } else {
          const written = await writeOutreachEmail({
            leadName: l.name, about: l.notes, need: l.need, city: cityOf(l.address), rating: l.rating, reviews: l.reviews,
            clientName: l.client_name, offer: l.offer, whyUs: l.why_us, firstStep: l.first_step, claimUrl: l.claim_url, goal: l.goal, touch: l.touches_sent,
          });
          body = written ? written.body + sign
            : messageFor(l.touches_sent, { leadName: l.name, clientName: l.client_name, offer: l.offer, need: l.need, senderName, address: l.mailing_address });
          subject = written
            ? (l.touches_sent === 0 ? written.subject : `Re: ${first?.subject?.replace(/^Re:\s*/i, '') ?? written.subject}`)
            : subjectFor(l.client_name, l.touches_sent);
        }
        // Follow-ups to a custom first email keep its subject as a reply.
        if (l.touches_sent > 0 && first?.subject) subject = `Re: ${first.subject.replace(/^Re:\s*/i, '')}`;
        const r = await query(
          `INSERT INTO outbox (lead_id, client_id, kind, step, touch, to_email, subject, body, status, in_reply_to, approved_at)
           VALUES ($1, $2, 'sequence', $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'approved' THEN now() END)
           ON CONFLICT (lead_id, touch) DO NOTHING`,
          [l.id, l.client_id, step.index, l.touches_sent, l.email, subject, body,
            settings.auto_send || l.approved ? 'approved' : 'pending', first?.message_id ?? null]);
        queued += r.rowCount ?? 0;
        break;
      }
      // A call or visit. It is skipped when nobody did it within a few days, or when the next
      // email is due, so the emails always go out on their days.
      const after = currentStep({ ...l, cadence_step: step.index + 1 }, l, now);
      if (isMissed(step, now) || (after?.channel === 'email' && after.due <= now)) {
        l.cadence_step = step.index + 1;
        await query(
          `UPDATE leads SET cadence_step = $2, steps_missed = steps_missed + 1,
             next_action_on = CASE WHEN next_action LIKE 'Call: follow up%' OR next_action LIKE 'Visit: drop in%' THEN NULL ELSE next_action_on END,
             next_action = CASE WHEN next_action LIKE 'Call: follow up%' OR next_action LIKE 'Visit: drop in%' THEN '' ELSE next_action END
           WHERE id = $1`, [l.id, l.cadence_step]);
        if (isScheduleLabel(l.next_action)) { l.next_action = ''; l.next_action_on = null; }
        continue;
      }
      // Put it on the rep's list, unless the rep set their own next step that is still ahead.
      const label = stepLabel(step, l);
      const repOwn = l.next_action_on && !isScheduleLabel(l.next_action) && l.next_action_on >= now;
      if (!repOwn && (l.next_action !== label || l.next_action_on !== step.due)) {
        await query('UPDATE leads SET next_action_on = $2, next_action = $3 WHERE id = $1', [l.id, step.due, label]);
      }
      break;
    }
  }
  return queued;
}

/** Sends approved messages, inside business hours and under each mailbox's daily cap. */
async function sendApproved(settings: Settings, now: Date) {
  // OUTREACH_IGNORE_HOURS exists only so tests can run at any time of day.
  if (process.env.OUTREACH_IGNORE_HOURS !== '1' && !inSendWindow(now, settings.start_hour, settings.end_hour)) return { sent: 0, failed: 0, note: 'Outside sending hours' };
  const rows = (await query<{
    id: number; lead_id: number; client_id: number; kind: string; touch: number | null; step: number | null; to_email: string; subject: string; body: string;
    in_reply_to: string | null; client_name: string; logo_url: string;
  }>(`SELECT o.id, o.lead_id, l.client_id, o.kind, o.touch, o.step, o.to_email, o.subject, o.body, o.in_reply_to, c.name AS client_name, c.logo_url
      FROM outbox o JOIN leads l ON l.id = o.lead_id JOIN clients c ON c.id = l.client_id
      WHERE o.status = 'approved' ORDER BY o.kind DESC, o.created_at, o.id LIMIT 500`)).rows; // replies first: a person is waiting
  if (!rows.length) return { sent: 0, failed: 0, note: '' };
  const sentToday = new Map((await query<{ sent_via: string; n: string }>(
    `SELECT sent_via, count(*) AS n FROM outbox WHERE status = 'sent'
     AND (sent_at AT TIME ZONE 'America/Detroit')::date = (now() AT TIME ZONE 'America/Detroit')::date GROUP BY sent_via`)).rows
    .map((r) => [r.sent_via, Number(r.n)]));
  const accounts = new Map<number, MailAccount | null>();
  let sent = 0;
  let failed = 0;
  const full = new Set<string>();
  for (const m of rows) {
    if (!accounts.has(m.client_id)) accounts.set(m.client_id, await outreachAccount(m.client_id));
    const account = accounts.get(m.client_id);
    if (!account) continue;
    const limit = account.dailyLimit ?? settings.daily_limit;
    if (!remainingToday(limit, sentToday.get(account.key) ?? 0)) { full.add(account.from); continue; }
    // The prospect may have replied, opted out or been closed since this was queued.
    const lead = (await query<{ status: string; touches_sent: number }>('SELECT status, touches_sent FROM leads WHERE id = $1', [m.lead_id])).rows[0];
    const stillValid = m.kind === 'reply'
      ? Boolean(lead && ['new', 'following_up', 'talking', 'introduced'].includes(lead.status))
      : Boolean(lead && ['new', 'following_up'].includes(lead.status) && lead.touches_sent === m.touch);
    if (!stillValid) {
      await query("UPDATE outbox SET status = 'cancelled' WHERE id = $1", [m.id]);
      continue;
    }
    try {
      const html = m.logo_url ? toHtml(m.body, { logoUrl: m.logo_url, clientName: m.client_name }) : undefined;
      const messageId = await sendMail({ to: m.to_email, subject: m.subject, text: m.body, html, inReplyTo: m.in_reply_to }, account);
      await query("UPDATE outbox SET status = 'sent', message_id = $2, sent_at = now(), error = '', sent_via = $3 WHERE id = $1", [m.id, messageId, account.key]);
      if (m.kind === 'reply') {
        await query('UPDATE leads SET last_touch_at = now() WHERE id = $1', [m.lead_id]);
      } else {
        await query(
          `UPDATE leads SET touches_sent = $2 + 1, cadence_step = GREATEST(cadence_step, $3 + 1), status = 'following_up',
             first_touch_at = COALESCE(first_touch_at, now()), last_touch_at = now() WHERE id = $1`, [m.lead_id, m.touch, m.step ?? 0]);
      }
      sentToday.set(account.key, (sentToday.get(account.key) ?? 0) + 1);
      sent++;
    } catch (err) {
      await query("UPDATE outbox SET status = 'failed', error = $2 WHERE id = $1", [m.id, String((err as Error).message).slice(0, 500)]);
      failed++;
    }
  }
  return { sent, failed, note: full.size ? `Daily limit reached for ${[...full].join(', ')}` : '' };
}

/** Every mailbox to read: the shared one (if it can read) and each client's own. */
async function readableAccounts() {
  const shared = sharedAccount();
  return [...(shared?.imap ? [shared] : []), ...(await allClientAccounts())];
}

/** Reads new mail in every mailbox, matches it to a prospect and acts on what kind of reply it is. */
async function readReplies() {
  const accounts = await readableAccounts();
  if (!accounts.length) return { read: 0, note: 'Reply reading is not connected' };
  let read = 0;
  const notes: string[] = [];
  for (const account of accounts) {
    let mail;
    try {
      mail = await fetchUnread(account);
      if (account.clientId) await query("UPDATE client_mailboxes SET last_error = '' WHERE client_id = $1 AND last_error <> ''", [account.clientId]);
    } catch (err) {
      const msg = `Reading ${account.from} failed: ${(err as Error).message}`;
      notes.push(msg);
      if (account.clientId) await query('UPDATE client_mailboxes SET last_error = $2 WHERE client_id = $1', [account.clientId, msg.slice(0, 500)]);
      continue;
    }
    for (const m of mail) {
      const dup = await query('SELECT 1 FROM replies WHERE message_id = $1', [m.messageId]);
      if (dup.rowCount) continue;
      // Match by thread first (the reply points at one of our Message-IDs), then by sender.
      const ids = [m.inReplyTo, ...m.references].filter(Boolean);
      // Bounce reports quote the original Message-ID in their body.
      for (const found of m.text.matchAll(/<[^<>\s]+@[^<>\s]+>/g)) ids.push(found[0]);
      let leadId: number | null = null;
      if (ids.length) {
        leadId = (await query<{ lead_id: number }>('SELECT lead_id FROM outbox WHERE message_id = ANY($1) LIMIT 1', [ids])).rows[0]?.lead_id ?? null;
      }
      if (!leadId) {
        leadId = (await query<{ id: number }>(
          `SELECT id FROM leads WHERE email = $1 AND email <> '' ${account.clientId ? 'AND client_id = $2' : ''} ORDER BY id DESC LIMIT 1`,
          account.clientId ? [addressOf(m.from), account.clientId] : [addressOf(m.from)])).rows[0]?.id ?? null;
      }
      const kind = classifyReply(m);
      const replyId = (await query<{ id: number }>(
        'INSERT INTO replies (lead_id, client_id, message_id, from_email, subject, body, kind, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [leadId, account.clientId, m.messageId, addressOf(m.from), m.subject.slice(0, 500), m.text, kind, m.date])).rows[0].id;
      read++;
      if (!leadId || kind === 'auto') continue;
      // Any real response stops the automatic schedule, including drafts not yet sent.
      await query("UPDATE outbox SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('pending', 'approved')", [leadId]);
      if (kind === 'opt_out') {
        await query("UPDATE leads SET status = 'opted_out', closed_on = $2, next_action_on = NULL, next_action = '' WHERE id = $1 AND status <> 'won'", [leadId, today()]);
      } else if (kind === 'bounce') {
        await query(
          "UPDATE leads SET status = 'lost', lost_reason = 'Email bounced', closed_on = $2, next_action_on = NULL, next_action = '' WHERE id = $1 AND status IN ('new', 'following_up')",
          [leadId, today()]);
      } else if (kind === 'not_interested') {
        await query(
          "UPDATE leads SET status = 'lost', lost_reason = 'Not interested', closed_on = $2, next_action_on = NULL, next_action = '' WHERE id = $1 AND status IN ('new', 'following_up', 'talking')",
          [leadId, today()]);
      } else {
        await query(
          `UPDATE leads SET status = CASE WHEN status IN ('new', 'following_up') THEN 'talking' ELSE status END,
             next_action_on = $2, next_action = 'They replied: call them now, or approve the reply draft in Outbox' WHERE id = $1`, [leadId, today()]);
        await createReplyDraft(leadId, replyId, m, account).catch((err) => notes.push(`Reply draft failed: ${(err as Error).message}`));
        await alertRep(leadId, m.text, account).catch((err) => console.error('reply alert failed:', err));
      }
    }
  }
  return { read, note: notes.join('. ') };
}

const said = (text: string) => text.split(/\n\s*On .+wrote:|\n>/)[0].trim();

/** Writes a reply for a person to approve. Never sent without approval, even in automatic mode. */
async function createReplyDraft(leadId: number, replyId: number, m: { messageId: string; subject: string; text: string; from: string }, account: MailAccount) {
  const l = (await query<{
    name: string; email: string; client_id: number; client_name: string; offer: string; why_us: string; first_step: string; claim_url: string;
    call_script: string; pricing: unknown; mailing_address: string; goal: string;
  }>(`SELECT l.name, l.email, c.id AS client_id, c.name AS client_name, c.offer, c.why_us, c.first_step, c.claim_url, c.call_script, c.pricing, c.mailing_address, c.goal
      FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!l) return;
  const pricing = l.pricing && typeof l.pricing === 'object' && Array.isArray((l.pricing as { types?: unknown[] }).types)
    ? ((l.pricing as { types: { name: string; ratePer1000Cents: number }[] }).types).map((t) => `${t.name}: $${(t.ratePer1000Cents / 100).toFixed(2)} per 1,000 sq ft per visit`).join('\n')
    : '';
  const draft = await draftReply({
    leadName: l.name, theyWrote: said(m.text), clientName: l.client_name, offer: l.offer, whyUs: l.why_us, firstStep: l.first_step,
    claimUrl: l.claim_url, script: l.call_script, pricing, goal: l.goal,
  });
  const body = draft.reply + signOff({ clientName: l.client_name, senderName: account.senderName ?? nameOf(account.from), address: l.mailing_address });
  const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject || `Quick question from ${l.client_name}`}`;
  await query(
    `INSERT INTO outbox (lead_id, client_id, kind, reply_id, intent, to_email, subject, body, status, in_reply_to)
     VALUES ($1, $2, 'reply', $3, $4, $5, $6, $7, 'pending', $8) ON CONFLICT DO NOTHING`,
    [leadId, l.client_id, replyId, draft.source === 'ai' ? draft.intent : '', addressOf(m.from) || l.email, subject.slice(0, 300), body, m.messageId]);
}

/**
 * Emails the assigned rep (or every owner, if nobody is assigned) the moment a prospect replies.
 * A reply answered within the hour is worth far more than one answered tomorrow.
 */
async function alertRep(leadId: number, replyText: string, via: MailAccount | null = null) {
  const account = sharedAccount() ?? via;
  if (!account) return;
  const l = (await query<{ name: string; phone: string; email: string; client_name: string; client_id: number; assignee_email: string | null }>(
    `SELECT l.name, l.phone, l.email, c.name AS client_name, c.id AS client_id, u.email AS assignee_email
     FROM leads l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.assignee_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!l) return;
  const to = l.assignee_email
    ? [l.assignee_email]
    : (await query<{ email: string }>("SELECT email FROM users WHERE role = 'owner'")).rows.map((r) => r.email);
  if (!to.length) return;
  await sendMail({
    to: to.join(', '),
    subject: `Reply from ${l.name} (${l.client_name}): call them now`,
    text: [`${l.name} replied to outreach for ${l.client_name}.`, '', said(replyText).slice(0, 1000), '', l.phone && `Phone: ${l.phone}`, l.email && `Email: ${l.email}`,
      '', 'Call within the hour if you can, or approve the drafted reply in the Outbox. Log the call in the system when you are done.']
      .filter((x): x is string => typeof x === 'string').join('\n').replace(/\n{3,}/g, '\n\n'),
  }, account);
}

export type RunReport = { queued: number; sent: number; failed: number; read: number; notes: string[] };

/**
 * One full run. A Postgres advisory lock makes sure two runs never overlap (a background run
 * and a button press, or two app instances), so nothing is ever sent twice.
 */
export async function runOutreach(now = new Date()): Promise<RunReport | null> {
  const client = await pool.connect();
  try {
    const got = (await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(727301) AS ok')).rows[0].ok;
    if (!got) return null;
    try {
      const settings = await getSettings();
      const notes: string[] = [];
      let report: RunReport = { queued: 0, sent: 0, failed: 0, read: 0, notes };
      try {
        try {
          const a = await runAutopilot();
          notes.push(...a.notes);
          if (a.searches || a.added) notes.push(`Autopilot: ${a.searches} search${a.searches === 1 ? '' : 'es'}, ${a.added} prospect${a.added === 1 ? '' : 's'} added`);
          await query('UPDATE outreach_settings SET last_autopilot = $1 WHERE id = 1',
            [`${new Date().toISOString()}|${a.searches}|${a.added}|${a.notes.join('; ')}`]);
        } catch (err) {
          notes.push(`Autopilot failed: ${(err as Error).message}`);
        }
        // Emails queue only for clients with a mailbox (theirs or the shared one); calls and visits always.
        const queued = await queueDue(settings);
        const s = await sendApproved(settings, now);
        if (s.note) notes.push(s.note);
        let r = { read: 0, note: '' };
        try { r = await readReplies(); } catch (err) { notes.push(`Reading replies failed: ${(err as Error).message}`); }
        if (r.note) notes.push(r.note);
        report = { queued, sent: s.sent, failed: s.failed, read: r.read, notes };
        await query("UPDATE outreach_settings SET last_run_at = now(), last_error = $1 WHERE id = 1",
          [notes.filter((n) => n.includes('failed')).join(' ')]);
      } catch (err) {
        await query('UPDATE outreach_settings SET last_run_at = now(), last_error = $1 WHERE id = 1', [String((err as Error).message).slice(0, 500)]);
        notes.push(`Run failed: ${(err as Error).message}`);
      }
      return report;
    } finally {
      await client.query('SELECT pg_advisory_unlock(727301)');
    }
  } finally {
    client.release();
  }
}

/** Emails the client an interested prospect: who they are, what they said, how to reach them. */
export async function handOver(leadId: number, userName: string) {
  const l = (await query<{
    name: string; email: string; phone: string; notes: string; need: string; client_id: number; client_name: string; contact_name: string; contact_email: string; status: string;
  }>(`SELECT l.name, l.email, l.phone, l.notes, l.need, l.status, c.id AS client_id, c.name AS client_name, c.contact_name, c.contact_email
      FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!l) throw new Error('That prospect no longer exists.');
  const account = sharedAccount() ?? await clientAccount(l.client_id, true);
  if (!account) throw new Error('No mailbox is connected, so the introduction cannot be emailed.');
  if (!['talking', 'new', 'following_up', 'introduced'].includes(l.status)) throw new Error('Only open prospects can be handed over.');
  if (!l.contact_email) throw new Error(`Add a contact email for ${l.client_name} on its client page first.`);
  const reply = (await query<{ body: string }>(
    "SELECT body FROM replies WHERE lead_id = $1 AND kind = 'reply' ORDER BY received_at DESC LIMIT 1", [leadId])).rows[0];
  const text = [
    `Hi ${l.contact_name?.split(' ')[0] || 'there'},`,
    '',
    `A new interested prospect for ${l.client_name}. Please reach out today while they are expecting to hear from you.`,
    '',
    `Name: ${l.name}`,
    l.email && `Email: ${l.email}`,
    l.phone && `Phone: ${l.phone}`,
    l.need && `What they need: ${l.need}`,
    l.notes && `\nAbout them:\n${l.notes}`,
    reply && `\nWhat they wrote:\n${reply.body.split(/\n\s*On .+wrote:|\n>/)[0].trim()}`,
    '',
    'Please let me know how it goes, and when they become a customer.',
    '',
    userName,
  ].filter((x): x is string => typeof x === 'string' && x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
  await sendMail({ to: l.contact_email, subject: `New prospect for ${l.client_name}: ${l.name}`, text }, account);
  await query(
    "UPDATE leads SET status = 'introduced', introduced_on = COALESCE(introduced_on, $2), handed_over_at = now() WHERE id = $1",
    [leadId, today()]);
}
