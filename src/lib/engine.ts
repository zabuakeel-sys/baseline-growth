// The outreach engine. One run: queue the messages that are due, send the approved ones inside
// the limits, then read the mailbox and act on replies. Runs every few minutes in the
// background (see src/instrumentation.ts) and on demand from the Outbox page.
import { pool, query } from './db';
import { SCHEDULE_DAYS, isDue, messageFor } from './followup';
import { addressOf, classifyReply, inSendWindow, remainingToday } from './mailrules';
import { fetchUnread, mailStatus, sendMail } from './mail';
import { today } from './work';

export type Settings = { auto_send: boolean; daily_limit: number; start_hour: number; end_hour: number; last_run_at: string | null; last_error: string };

export async function getSettings() {
  return (await query<Settings>('SELECT * FROM outreach_settings WHERE id = 1')).rows[0];
}

const subjectFor = (clientName: string, touch: number) =>
  `${touch === 0 ? '' : 'Re: '}Quick question from ${clientName}`;

const senderName = () => (process.env.OUTREACH_FROM ?? '').replace(/<.*>/, '').replace(/"/g, '').trim();

/** Creates outbox entries for every prospect whose next message is due. */
async function queueDue(settings: Settings) {
  const leads = (await query<{
    id: number; email: string; name: string; need: string; received_on: string; touches_sent: number; status: string;
    client_name: string; offer: string; mailing_address: string;
  }>(`SELECT l.id, l.email, l.name, l.need, l.received_on, l.touches_sent, l.status,
        c.name AS client_name, c.offer, c.mailing_address
      FROM leads l JOIN clients c ON c.id = l.client_id
      WHERE l.status IN ('new', 'following_up') AND l.email <> '' AND l.touches_sent < $1
        AND c.status <> 'ended' AND c.mailing_address <> ''`, [SCHEDULE_DAYS.length])).rows;
  const now = today();
  let queued = 0;
  for (const l of leads) {
    if (!isDue(l, now)) continue;
    const first = l.touches_sent > 0
      ? (await query<{ message_id: string }>("SELECT message_id FROM outbox WHERE lead_id = $1 AND touch = 0 AND status = 'sent'", [l.id])).rows[0]
      : undefined;
    const body = messageFor(l.touches_sent, {
      leadName: l.name, clientName: l.client_name, offer: l.offer, need: l.need, senderName: senderName(), address: l.mailing_address,
    });
    const r = await query(
      `INSERT INTO outbox (lead_id, touch, to_email, subject, body, status, in_reply_to, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'approved' THEN now() END)
       ON CONFLICT (lead_id, touch) DO NOTHING`,
      [l.id, l.touches_sent, l.email, subjectFor(l.client_name, l.touches_sent), body,
        settings.auto_send ? 'approved' : 'pending', first?.message_id ?? null]);
    queued += r.rowCount ?? 0;
  }
  return queued;
}

/** Sends approved messages, inside business hours and under the daily cap. */
async function sendApproved(settings: Settings, now: Date) {
  if (!mailStatus().send) return { sent: 0, failed: 0, note: 'Sending is not connected' };
  // OUTREACH_IGNORE_HOURS exists only so tests can run at any time of day.
  if (process.env.OUTREACH_IGNORE_HOURS !== '1' && !inSendWindow(now, settings.start_hour, settings.end_hour)) return { sent: 0, failed: 0, note: 'Outside sending hours' };
  const sentToday = Number((await query<{ n: string }>(
    `SELECT count(*) AS n FROM outbox WHERE status = 'sent'
     AND (sent_at AT TIME ZONE 'America/Detroit')::date = (now() AT TIME ZONE 'America/Detroit')::date`)).rows[0].n);
  const room = remainingToday(settings.daily_limit, sentToday);
  if (!room) return { sent: 0, failed: 0, note: 'Daily limit reached' };
  const rows = (await query<{ id: number; lead_id: number; touch: number; to_email: string; subject: string; body: string; in_reply_to: string | null }>(
    "SELECT id, lead_id, touch, to_email, subject, body, in_reply_to FROM outbox WHERE status = 'approved' ORDER BY created_at, id LIMIT $1", [room])).rows;
  let sent = 0;
  let failed = 0;
  for (const m of rows) {
    // The prospect may have replied, opted out or been closed since this was queued.
    const lead = (await query<{ status: string; touches_sent: number }>('SELECT status, touches_sent FROM leads WHERE id = $1', [m.lead_id])).rows[0];
    if (!lead || !['new', 'following_up'].includes(lead.status) || lead.touches_sent !== m.touch) {
      await query("UPDATE outbox SET status = 'cancelled' WHERE id = $1", [m.id]);
      continue;
    }
    try {
      const messageId = await sendMail({ to: m.to_email, subject: m.subject, text: m.body, inReplyTo: m.in_reply_to });
      await query("UPDATE outbox SET status = 'sent', message_id = $2, sent_at = now(), error = '' WHERE id = $1", [m.id, messageId]);
      await query(
        `UPDATE leads SET touches_sent = $2 + 1, status = 'following_up',
           first_touch_at = COALESCE(first_touch_at, now()), last_touch_at = now() WHERE id = $1`, [m.lead_id, m.touch]);
      sent++;
    } catch (err) {
      await query("UPDATE outbox SET status = 'failed', error = $2 WHERE id = $1", [m.id, String((err as Error).message).slice(0, 500)]);
      failed++;
    }
  }
  return { sent, failed, note: '' };
}

/** Reads new mail, matches it to a prospect and acts on what kind of reply it is. */
async function readReplies() {
  if (!mailStatus().read) return { read: 0, note: 'Reply reading is not connected' };
  const mail = await fetchUnread();
  let read = 0;
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
        "SELECT id FROM leads WHERE email = $1 AND email <> '' ORDER BY id DESC LIMIT 1", [addressOf(m.from)])).rows[0]?.id ?? null;
    }
    const kind = classifyReply(m);
    await query(
      'INSERT INTO replies (lead_id, message_id, from_email, subject, body, kind, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [leadId, m.messageId, addressOf(m.from), m.subject.slice(0, 500), m.text, kind, m.date]);
    read++;
    if (!leadId || kind === 'auto') continue;
    // Any real response stops the automatic sequence.
    await query("UPDATE outbox SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('pending', 'approved')", [leadId]);
    if (kind === 'opt_out') {
      await query("UPDATE leads SET status = 'opted_out', closed_on = $2 WHERE id = $1 AND status <> 'won'", [leadId, today()]);
    } else if (kind === 'bounce') {
      await query(
        "UPDATE leads SET status = 'lost', lost_reason = 'Email bounced', closed_on = $2 WHERE id = $1 AND status IN ('new', 'following_up')",
        [leadId, today()]);
    } else if (kind === 'not_interested') {
      await query(
        "UPDATE leads SET status = 'lost', lost_reason = 'Not interested', closed_on = $2 WHERE id = $1 AND status IN ('new', 'following_up', 'talking')",
        [leadId, today()]);
    } else {
      await query(
        `UPDATE leads SET status = CASE WHEN status IN ('new', 'following_up') THEN 'talking' ELSE status END,
           next_action_on = $2, next_action = 'They replied: call them now' WHERE id = $1`, [leadId, today()]);
      await alertRep(leadId, m.text).catch((err) => console.error('reply alert failed:', err));
    }
  }
  return { read, note: '' };
}

/**
 * Emails the assigned rep (or every owner, if nobody is assigned) the moment a prospect replies.
 * A reply answered within the hour is worth far more than one answered tomorrow.
 */
async function alertRep(leadId: number, replyText: string) {
  if (!mailStatus().send) return;
  const l = (await query<{ name: string; phone: string; email: string; client_name: string; client_id: number; assignee_email: string | null }>(
    `SELECT l.name, l.phone, l.email, c.name AS client_name, c.id AS client_id, u.email AS assignee_email
     FROM leads l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.assignee_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!l) return;
  const to = l.assignee_email
    ? [l.assignee_email]
    : (await query<{ email: string }>("SELECT email FROM users WHERE role = 'owner'")).rows.map((r) => r.email);
  if (!to.length) return;
  const said = replyText.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 1000);
  await sendMail({
    to: to.join(', '),
    subject: `Reply from ${l.name} (${l.client_name}): call them now`,
    text: [`${l.name} replied to outreach for ${l.client_name}.`, '', said, '', l.phone && `Phone: ${l.phone}`, l.email && `Email: ${l.email}`,
      '', 'Call within the hour if you can. Log the call in the system when you are done.']
      .filter((x): x is string => typeof x === 'string').join('\n').replace(/\n{3,}/g, '\n\n'),
  });
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
        // Until a mailbox is connected, prospects stay on the manual copy-and-send flow.
        const queued = mailStatus().send ? await queueDue(settings) : 0;
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
  if (!mailStatus().send) throw new Error('Sending is not connected, so the introduction cannot be emailed.');
  const l = (await query<{
    name: string; email: string; phone: string; notes: string; need: string; client_name: string; contact_name: string; contact_email: string; status: string;
  }>(`SELECT l.name, l.email, l.phone, l.notes, l.need, l.status, c.name AS client_name, c.contact_name, c.contact_email
      FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!l) throw new Error('That prospect no longer exists.');
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
  await sendMail({ to: l.contact_email, subject: `New prospect for ${l.client_name}: ${l.name}`, text });
  await query(
    "UPDATE leads SET status = 'introduced', introduced_on = COALESCE(introduced_on, $2), handed_over_at = now() WHERE id = $1",
    [leadId, today()]);
}
