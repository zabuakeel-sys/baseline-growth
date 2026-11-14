import { query } from '@/lib/db';
import { PROVIDERS, mailStatus } from '@/lib/mail';
import { secretConfigured } from '@/lib/secret';
import { microsoftConfigured } from '@/lib/msoauth';
import { connectMicrosoftApp, removeMailbox, saveMailbox, testMailbox } from './mailbox';
import { graphConfigured } from '@/lib/graph';
import ActionForm from '../ActionForm';

type Box = { auth: string; from_name: string; email: string; provider: keyof typeof PROVIDERS; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; daily_limit: number; verified_at: string | null; last_error: string };

/**
 * Where a business's outreach is sent from. By default every business sends through the shared
 * Baseline Growth mailbox under its own name, so there is nothing to set up. A business can have a
 * separate connected address (tucked under "Advanced"); only one that passed its test is used.
 */
export default async function MailboxPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const row = (await query<Box>(
    `SELECT auth, from_name, email, provider, smtp_host, smtp_port, imap_host, imap_port, daily_limit, last_error,
       to_char(verified_at AT TIME ZONE 'America/Detroit', 'Mon DD, HH12:MI AM') AS verified_at
     FROM client_mailboxes WHERE client_id = $1`, [clientId])).rows[0];
  const shared = mailStatus();
  const box = row?.verified_at ? row : undefined;       // only a tested mailbox is actually used
  const halfSetUp = row && !row.verified_at ? row : undefined; // a saved-but-not-working one, hidden by default

  return (
    <section className="card" aria-labelledby="mailbox-h">
      <h2 id="mailbox-h">Mailbox</h2>

      {box ? (
        <>
          <p>
            Outreach for {clientName} is sent from its own address.{' '}
            <strong>{box.email}</strong>{' '}
            <span className="muted">{box.auth === 'graph' ? '· through the Microsoft app ' : box.auth === 'oauth' ? '· connected with Microsoft ' : ''}</span>
            <span className="pill signed">Connected {box.verified_at}</span>
          </p>
          <div className="actions" style={{ marginBottom: 4 }}>
            <ActionForm action={testMailbox.bind(null, clientId)}><button type="submit" className="secondary small">Re-test</button></ActionForm>
            <ActionForm action={removeMailbox.bind(null, clientId)}><button type="submit" className="secondary small">Use the shared mailbox instead</button></ActionForm>
          </div>
        </>
      ) : shared.send ? (
        <p className="notice" role="status" style={{ marginTop: 0 }}>
          Emails for {clientName} are sent from your Baseline Growth mailbox, shown to the recipient as
          <strong> {clientName}</strong>. Replies come back to that one inbox and are sorted here automatically.
          Nothing to set up.
        </p>
      ) : (
        <p className="warn-card card" style={{ marginTop: 0 }}>
          No mailbox is connected yet, so no emails can be sent. Add the shared Baseline Growth mailbox in Railway
          (<code>OUTREACH_FROM</code>, <code>SMTP_*</code>, <code>IMAP_*</code>), or connect an address for {clientName} under Advanced below.
        </p>
      )}

      <details>
        <summary className="muted">Advanced: give {clientName} its own sending address</summary>
        <p className="muted" style={{ fontSize: 13 }}>
          Most businesses do not need this. Use it only if {clientName} wants emails sent from its own address instead of
          the shared one. Cold email from a business&apos;s real domain can hurt that domain&apos;s inbox reputation.
        </p>
        {halfSetUp && (
          <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>A mailbox was started for {clientName} but never passed its test, so it is not used. Finish it below, or</span>
            <ActionForm action={removeMailbox.bind(null, clientId)}><button type="submit" className="secondary small">remove it</button></ActionForm>
          </div>
        )}
        {!secretConfigured() && <p className="muted" style={{ color: 'var(--bad)', fontSize: 13 }}>APP_SECRET is not set on the server, so a password here cannot be saved. Add it in Railway.</p>}

        {(graphConfigured() || microsoftConfigured()) && (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}><strong>Microsoft 365 / Outlook</strong> (no password):</p>
            {graphConfigured() && (
              <ActionForm className="inline-form" action={connectMicrosoftApp.bind(null, clientId)}>
                <label style={{ flex: 2 }}>Microsoft 365 address<input name="ms_email" type="email" defaultValue={row?.provider === 'microsoft' ? row.email : ''} placeholder="name@business.com" /></label>
                <label style={{ flex: 1 }}>Sign emails as<input name="ms_from_name" defaultValue={row?.from_name ?? ''} placeholder="Your name" /></label>
                <button type="submit" style={{ alignSelf: 'flex-end' }}>Connect</button>
              </ActionForm>
            )}
            {microsoftConfigured() && <p className="muted" style={{ fontSize: 13 }}>Or <a href={`/oauth/microsoft/start?client=${clientId}`}>sign in with Microsoft</a>.</p>}
          </>
        )}

        <p className="muted" style={{ fontSize: 13, margin: '10px 0 4px' }}><strong>Google or other</strong> (app password):</p>
        <ActionForm className="grid" action={saveMailbox.bind(null, clientId)}>
          <label>Provider
            <select name="provider" defaultValue={row?.provider ?? 'google'}>
              {Object.entries(PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </label>
          <label>Email address<input name="box_email" type="email" defaultValue={row?.email ?? ''} autoComplete="off" /></label>
          <label>Sign emails as (your name)<input name="from_name" defaultValue={row?.from_name ?? ''} /></label>
          <label>App password<input name="password" type="password" autoComplete="new-password" /></label>
          <label>Most emails per day<input name="daily_limit" inputMode="numeric" defaultValue={row?.daily_limit ?? 20} /></label>
          <p className="muted full" style={{ margin: 0, fontSize: 13 }}>For &quot;Other&quot; only:</p>
          <label>Sending server (SMTP)<input name="smtp_host" defaultValue={row?.provider === 'other' ? row.smtp_host : ''} placeholder="smtp.example.com" /></label>
          <label>SMTP port<input name="smtp_port" inputMode="numeric" defaultValue={row?.provider === 'other' ? row.smtp_port : 465} /></label>
          <label>Reading server (IMAP)<input name="imap_host" defaultValue={row?.provider === 'other' ? row.imap_host : ''} placeholder="imap.example.com" /></label>
          <label>IMAP port<input name="imap_port" inputMode="numeric" defaultValue={row?.provider === 'other' ? row.imap_port : 993} /></label>
          <div className="actions full"><button type="submit">Save and test</button></div>
        </ActionForm>
      </details>
    </section>
  );
}
