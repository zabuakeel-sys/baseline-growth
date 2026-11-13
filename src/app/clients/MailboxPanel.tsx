import { query } from '@/lib/db';
import { PROVIDERS } from '@/lib/mail';
import { secretConfigured } from '@/lib/secret';
import { removeMailbox, saveMailbox, testMailbox } from './mailbox';
import ActionForm from '../ActionForm';

type Box = { from_name: string; email: string; provider: keyof typeof PROVIDERS; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; daily_limit: number; verified_at: string | null; last_error: string };

/** The business's own outreach mailbox: where its emails go out from and where replies are read. Owner only. */
export default async function MailboxPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const box = (await query<Box>(
    `SELECT from_name, email, provider, smtp_host, smtp_port, imap_host, imap_port, daily_limit, last_error,
       to_char(verified_at AT TIME ZONE 'America/Detroit', 'Mon DD, HH12:MI AM') AS verified_at
     FROM client_mailboxes WHERE client_id = $1`, [clientId])).rows[0];
  return (
    <section className="card" aria-labelledby="mailbox-h">
      <h2 id="mailbox-h">Mailbox</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        The address {clientName} gave you for outreach. Emails for {clientName} go out from it and replies are read from it.
        Use an <strong>app password</strong> (Google: Account, Security, App passwords; Microsoft: Security info, App password), never the normal one.
      </p>
      {!secretConfigured() && <p className="error">APP_SECRET is not set on the server, so passwords cannot be saved. Add it in Railway (a long random value).</p>}
      {box && (
        <p>
          <strong>{box.email}</strong> <span className="muted">· signed &quot;{box.from_name}&quot; · up to {box.daily_limit} a day</span>{' '}
          {box.verified_at
            ? <span className="pill signed">Connected {box.verified_at}</span>
            : <span className="pill missing">Not tested</span>}
          {box.last_error && <span className="error" style={{ display: 'block', fontSize: 13 }}>{box.last_error}</span>}
        </p>
      )}
      {box && (
        <div className="actions" style={{ marginBottom: 12 }}>
          <ActionForm action={testMailbox.bind(null, clientId)}><button type="submit">Test connection</button></ActionForm>
          <ActionForm action={removeMailbox.bind(null, clientId)}><button type="submit" className="secondary">Remove mailbox</button></ActionForm>
        </div>
      )}
      <details open={!box}>
        <summary><strong>{box ? 'Change mailbox' : 'Connect a mailbox'}</strong></summary>
        <ActionForm className="grid" action={saveMailbox.bind(null, clientId)}>
          <label>Provider
            <select name="provider" defaultValue={box?.provider ?? 'google'}>
              {Object.entries(PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </label>
          <label>Email address<input name="box_email" type="email" defaultValue={box?.email ?? ''} autoComplete="off" /></label>
          <label>Sign emails as (your name)<input name="from_name" defaultValue={box?.from_name ?? ''} /></label>
          <label>App password{box ? ' (leave empty to keep)' : ''}<input name="password" type="password" autoComplete="new-password" /></label>
          <label>Most emails per day<input name="daily_limit" inputMode="numeric" defaultValue={box?.daily_limit ?? 20} /></label>
          <p className="muted full" style={{ margin: 0, fontSize: 13 }}>For &quot;Other&quot; only (your provider&apos;s help page lists these):</p>
          <label>Sending server (SMTP)<input name="smtp_host" defaultValue={box?.provider === 'other' ? box.smtp_host : ''} placeholder="smtp.example.com" /></label>
          <label>SMTP port<input name="smtp_port" inputMode="numeric" defaultValue={box?.provider === 'other' ? box.smtp_port : 465} /></label>
          <label>Reading server (IMAP)<input name="imap_host" defaultValue={box?.provider === 'other' ? box.imap_host : ''} placeholder="imap.example.com" /></label>
          <label>IMAP port<input name="imap_port" inputMode="numeric" defaultValue={box?.provider === 'other' ? box.imap_port : 993} /></label>
          <p className="muted full" style={{ margin: 0, fontSize: 13 }}>
            Sending cold email from {clientName}&apos;s real domain puts that domain&apos;s reputation at risk. Keep it around 20 a day, and get
            their written OK before turning it on.
          </p>
          <div className="actions full"><button type="submit">Save mailbox</button></div>
        </ActionForm>
      </details>
    </section>
  );
}
