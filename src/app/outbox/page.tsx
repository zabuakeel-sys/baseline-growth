import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/engine';
import { mailStatus } from '@/lib/mail';
import { decideReplyDraft, reviewOutbox, runNow, saveSettings } from './actions';
import { INTENTS } from '@/lib/coach';
import ActionForm from '../ActionForm';

export const dynamic = 'force-dynamic';

type Msg = { id: number; lead_id: number; lead_name: string; client_name: string; client_id: number; touch: number | null; to_email: string; subject: string; body: string; status: string; error: string; sent_at: string | null };
type Draft = { id: number; lead_id: number; lead_name: string; client_name: string; client_id: number; to_email: string; subject: string; body: string; status: string; error: string; intent: string; they_wrote: string; phone: string };
type Reply = { id: number; lead_id: number | null; lead_name: string | null; client_id: number | null; client_name: string | null; from_email: string; subject: string; body: string; kind: string; received_at: string };

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' }) : '';
const KIND = { reply: 'Replied', not_interested: 'Not interested', opt_out: 'Opted out', auto: 'Automatic reply', bounce: 'Bounced' } as Record<string, string>;
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { saved } = await searchParams;
  const status = mailStatus();
  const boxes = (await query<{ n: string }>('SELECT count(*) AS n FROM client_mailboxes')).rows[0].n;
  const hasBoxes = Number(boxes) > 0;
  const settings = await getSettings();
  const [drafts, waiting, sent, replies, missing] = await Promise.all([
    query<Draft>(`SELECT o.id, o.lead_id, l.name AS lead_name, c.name AS client_name, c.id AS client_id, o.to_email, o.subject, o.body, o.status, o.error, o.intent,
                  COALESCE(r.body, '') AS they_wrote, l.phone
                FROM outbox o JOIN leads l ON l.id = o.lead_id JOIN clients c ON c.id = l.client_id LEFT JOIN replies r ON r.id = o.reply_id
                WHERE o.kind = 'reply' AND o.status IN ('pending', 'approved', 'failed') ORDER BY o.created_at, o.id`).then((r) => r.rows),
    query<Msg>(`SELECT o.id, o.lead_id, l.name AS lead_name, c.name AS client_name, c.id AS client_id, o.touch, o.to_email, o.subject, o.body, o.status, o.error,
                  to_char(o.sent_at AT TIME ZONE 'UTC', ${ISO}) AS sent_at
                FROM outbox o JOIN leads l ON l.id = o.lead_id JOIN clients c ON c.id = l.client_id
                WHERE o.kind = 'sequence' AND o.status IN ('pending', 'approved', 'failed') ORDER BY o.created_at, o.id`).then((r) => r.rows),
    query<Msg>(`SELECT o.id, o.lead_id, l.name AS lead_name, c.name AS client_name, c.id AS client_id, o.touch, o.to_email, o.subject, o.body, o.status, o.error,
                  to_char(o.sent_at AT TIME ZONE 'UTC', ${ISO}) AS sent_at
                FROM outbox o JOIN leads l ON l.id = o.lead_id JOIN clients c ON c.id = l.client_id
                WHERE o.status = 'sent' ORDER BY o.sent_at DESC LIMIT 200`).then((r) => r.rows),
    query<Reply>(`SELECT r.id, r.lead_id, l.name AS lead_name, c.id AS client_id, c.name AS client_name, r.from_email, r.subject, r.body, r.kind,
                    to_char(r.received_at AT TIME ZONE 'UTC', ${ISO}) AS received_at
                  FROM replies r LEFT JOIN leads l ON l.id = r.lead_id LEFT JOIN clients c ON c.id = l.client_id
                  ORDER BY r.received_at DESC LIMIT 50`).then((r) => r.rows),
    query<{ name: string; id: number }>(`SELECT DISTINCT c.id, c.name FROM clients c JOIN leads l ON l.client_id = c.id
                  WHERE c.mailing_address = '' AND l.email <> '' AND l.status IN ('new', 'following_up')`).then((r) => r.rows),
  ]);
  const sentToday = sent.filter((m) => m.sent_at && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date(m.sent_at))
    === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date())).length;
  const pending = waiting.filter((m) => m.status === 'pending');

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Outbox</h1>
          <p className="sub" style={{ margin: 0 }}>
            Every few minutes the system runs autopilot (finds and assigns new prospects), queues messages that are due, sends approved ones on weekdays from {settings.start_hour}:00
            to {settings.end_hour}:00 (Michigan time), up to {settings.daily_limit} a day, and reads replies.
          </p>
        </div>
        <ActionForm action={runNow}><button type="submit" className="secondary">Run now</button></ActionForm>
      </div>
      {saved && <p className="notice" role="status" style={{ marginTop: 12 }}>{saved}.</p>}

      {!hasBoxes && (!status.send || !status.read) && (
        <div className="card warn-card" style={{ marginTop: 16 }}>
          <strong>{!status.send && !status.read ? 'The outreach mailbox is not connected yet.' : !status.send ? 'Sending is not connected.' : 'Reply reading is not connected.'}</strong>
          <p style={{ margin: '6px 0 0' }}>
            Connect each business&apos;s outreach mailbox on its page (Mailbox section). For alerts to reps and hand-offs, you can also add a shared mailbox: in Railway, on the app
            service, add <code>OUTREACH_FROM</code> (like <code>Zaino &lt;zaino@youroutreachdomain.com&gt;</code>), <code>SMTP_HOST</code>,{' '}
            <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>IMAP_HOST</code>, <code>IMAP_USER</code> and <code>IMAP_PASS</code>.
            Until then nothing is queued here; send messages by hand from the Prospects page.
          </p>
        </div>
      )}
      {missing.length > 0 && (
        <div className="card warn-card">
          <strong>Not queued: no mailing address.</strong> US law requires one in commercial email. Add it on{' '}
          {missing.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Link href={`/clients/${c.id}#details-h`}>{c.name}</Link></span>)}.
        </div>
      )}

      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><div className="label">Waiting for approval</div><div className="value">{pending.length + drafts.filter((d) => d.status === 'pending').length}</div></div>
        <div className="stat"><div className="label">Sent today</div><div className="value">{sentToday}</div></div>
        <div className="stat"><div className="label">Mode</div><div className="value" style={{ fontSize: 18 }}>{settings.auto_send ? 'Automatic' : 'Approve first'}</div></div>
        <div className="stat"><div className="label">Last run</div><div className="value" style={{ fontSize: 18 }}>{settings.last_run_at ? when(settings.last_run_at) : 'Not yet'}</div></div>
      </div>
      {settings.last_error && <p className="error">Last run problem: {settings.last_error}</p>}

      <section className="card" aria-labelledby="drafts-h">
        <h2 id="drafts-h">Reply drafts ({drafts.length})</h2>
        {drafts.length === 0 ? <p className="muted" style={{ margin: 0 }}>When a prospect replies, a draft answer appears here. Nothing is sent until you approve it.</p> : (
          <ul className="plain-list">
            {drafts.map((d) => (
              <li key={d.id} className="draft">
                <p style={{ margin: '0 0 6px' }}>
                  <strong>{d.lead_name}</strong> <span className="muted">· {d.client_name} · to {d.to_email}{d.phone ? ` · ${d.phone}` : ''}</span>
                  {d.intent && <span className="pill" style={{ marginLeft: 8 }}>{INTENTS[d.intent as keyof typeof INTENTS] ?? d.intent}</span>}
                  {d.status === 'approved' && <span className="pill signed" style={{ marginLeft: 8 }}>Approved, sending</span>}
                </p>
                {d.they_wrote && <div className="reply-text"><span className="muted">They wrote: </span>{d.they_wrote.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 800)}</div>}
                {d.error && <p className="error" style={{ fontSize: 13 }}>{d.error}</p>}
                {d.status === 'approved' ? <pre className="message">{d.body}</pre> : (
                  <ActionForm action={decideReplyDraft.bind(null, d.id)}>
                    <label>Reply (edit before sending)<textarea name="body" defaultValue={d.body} rows={10} /></label>
                    <div className="actions">
                      <button type="submit" name="decision" value="send">Approve &amp; send</button>
                      <button type="submit" name="decision" value="discard" className="secondary">Discard</button>
                    </div>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="queue-h">
        <h2 id="queue-h">Queued ({waiting.length})</h2>
        {waiting.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing queued. Messages appear here when prospects are due.</p> : (
          <ActionForm action={reviewOutbox}>
            <div className="actions" style={{ marginBottom: 8 }}>
              <button type="submit" name="decision" value="approve">Approve ticked</button>
              <button type="submit" name="decision" value="cancel" className="secondary">Cancel ticked</button>
            </div>
            <ul className="candidates">
              {waiting.map((m) => (
                <li key={m.id}>
                  <label className="check">
                    <input type="checkbox" name="ids" value={m.id} defaultChecked={m.status === 'pending'} style={{ minHeight: 0 }} />
                    <span style={{ flex: 1 }}>
                      <strong>{m.lead_name}</strong> <span className="muted">· {m.client_name} · {m.touch === null ? 'reply' : m.touch === 0 ? 'first message' : `follow-up ${m.touch}`} · {m.to_email}</span>
                      <span className={`pill ${m.status === 'approved' ? 'signed' : m.status === 'failed' ? 'late' : 'missing'}`} style={{ marginLeft: 8 }}>
                        {m.status === 'pending' ? 'Needs approval' : m.status === 'approved' ? 'Approved' : 'Failed'}
                      </span>
                      {m.error && <span className="error" style={{ display: 'block', fontSize: 13 }}>{m.error}</span>}
                      <details><summary className="muted">{m.subject}</summary><pre className="message">{m.body}</pre></details>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </ActionForm>
        )}
      </section>

      <section className="card" aria-labelledby="replies-h">
        <h2 id="replies-h">Replies</h2>
        {replies.length === 0 ? <p className="muted" style={{ margin: 0 }}>No replies yet.</p> : (
          <ul className="plain-list">
            {replies.map((r) => (
              <li key={r.id}>
                <span className={`pill ${r.kind === 'reply' ? 'signed' : r.kind === 'opt_out' || r.kind === 'bounce' ? 'late' : ''}`}>{KIND[r.kind]}</span>{' '}
                {r.lead_id ? <Link href={`/clients/${r.client_id}#leads-h`}>{r.lead_name}</Link> : <span className="muted">{r.from_email} (no matching prospect)</span>}
                {r.client_name && <span className="muted"> · {r.client_name}</span>}
                <span className="muted"> · {when(r.received_at)}</span>
                {r.kind !== 'auto' && r.kind !== 'bounce' && <div className="reply-text">{r.body.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 600)}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card">
        <summary><strong>Sent ({sent.length} most recent)</strong></summary>
        <ul className="plain-list">
          {sent.map((m) => (
            <li key={m.id}><strong>{m.lead_name}</strong> <span className="muted">· {m.client_name} · {m.touch === null ? 'reply' : m.touch === 0 ? 'first message' : `follow-up ${m.touch}`} · {when(m.sent_at)}</span></li>
          ))}
        </ul>
      </details>

      {isOwner && (
        <section className="card" aria-labelledby="settings-h">
          <h2 id="settings-h">Settings</h2>
          <ActionForm className="grid" action={saveSettings}>
            <label className="check full">
              <input type="checkbox" name="auto_send" defaultChecked={settings.auto_send} style={{ minHeight: 0 }} />
              Send automatically, without approval
            </label>
            <label>Most emails per day<input name="daily_limit" inputMode="numeric" defaultValue={settings.daily_limit} /></label>
            <label>Start hour (Michigan time)<input name="start_hour" inputMode="numeric" defaultValue={settings.start_hour} /></label>
            <label>End hour<input name="end_hour" inputMode="numeric" defaultValue={settings.end_hour} /></label>
            <label>Most Google searches per day (autopilot)<input name="max_searches_per_day" inputMode="numeric" defaultValue={settings.max_searches_per_day} /></label>
            <label>Find a contact for up to N new prospects a day<input name="enrich_daily_limit" inputMode="numeric" defaultValue={settings.enrich_daily_limit} /></label>
            <p className="muted full" style={{ margin: 0, fontSize: 13 }}>
              A new mailbox should start low (around 20 a day) and rise slowly over a few weeks; sending a lot from a new domain
              is a common way to land in spam. That is general practice, not a published rule.
            </p>
            <div className="actions full"><button type="submit">Save settings</button></div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
