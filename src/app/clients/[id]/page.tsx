import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { today } from '@/lib/work';
import { cityOf, leadsForDay } from '@/lib/leads';
import { nextQueue, reasonFor } from '@/lib/queue';
import { query } from '@/lib/db';
import { setupSteps } from '@/lib/setup';
import { routeLink } from '@/lib/playbook';
import { startFinding } from '../onboarding';
import { approveFirstEmail } from '../outreach';
import { starterEmail } from '@/lib/setup';
import { fillEmail, ensureFooter } from '@/lib/followup';
import ActionForm from '../../ActionForm';

export const dynamic = 'force-dynamic';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * The business screen: a guiding work list for the salesperson. When live, it shows plainly whether
 * emails are going out on their own, who to call (with the facts to make the call), and who to visit.
 * Everything you only change now and then lives on the Settings page.
 */
export default async function ClientPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client } = found;
  const { saved } = await searchParams;
  const now = today();
  const live = Boolean(client.outreach_approved_at);

  // The work, newest-priority first, split into what the salesperson actually does.
  const dayLeads = (await leadsForDay(null)).filter((l) => l.client_id === id
    && (isOwner || l.assignee_id === user.id));
  const queue = nextQueue(dayLeads, now);
  const replies = queue.filter((l) => reasonFor(l, now) === 'replied');
  const calls = queue.filter((l) => ['call', 'new'].includes(reasonFor(l, now)));
  const visits = queue.filter((l) => reasonFor(l, now) === 'visit');

  const act = (await query<{ emails_sent: number; last_email: string | null; replies: number; drafts: number; prospects: number; customers: number }>(
    `SELECT
       (SELECT count(*)::int FROM outbox WHERE client_id = $1 AND status = 'sent') AS emails_sent,
       (SELECT to_char(max(sent_at) AT TIME ZONE 'America/Detroit', 'Mon DD') FROM outbox WHERE client_id = $1 AND status = 'sent') AS last_email,
       (SELECT count(*)::int FROM replies r JOIN leads l ON l.id = r.lead_id WHERE l.client_id = $1 AND r.kind = 'reply') AS replies,
       (SELECT count(*)::int FROM outbox WHERE client_id = $1 AND kind = 'reply' AND status = 'pending') AS drafts,
       (SELECT count(*)::int FROM leads WHERE client_id = $1 AND status IN ('new','following_up','talking')) AS prospects,
       (SELECT count(*)::int FROM leads WHERE client_id = $1 AND status = 'won') AS customers`,
    [id])).rows[0];

  const finding = (await query<{ searches: number; run: number; waiting: number }>(
    `SELECT (SELECT count(*)::int FROM targets WHERE client_id = $1) AS searches,
            (SELECT count(*)::int FROM targets WHERE client_id = $1 AND last_run_at IS NOT NULL) AS run,
            (SELECT count(*)::int FROM candidates WHERE client_id = $1 AND status = 'found') AS waiting`, [id])).rows[0];
  const totalProspects = (await query<{ n: number }>('SELECT count(*)::int AS n FROM leads WHERE client_id = $1', [id])).rows[0].n;

  // Where prospects come from. Shown until the business has its first prospects, so a new
  // business never lands on an empty screen with no next step.
  const getProspects = (
    <section className="card" aria-labelledby="prospects-h">
      <h2 id="prospects-h" style={{ marginTop: 0 }}>Get prospects for {client.name}</h2>
      {client.autopilot ? (
        <p style={{ marginTop: 0 }}>
          Prospect finding is <strong>on</strong>: {finding.searches} search{finding.searches === 1 ? '' : 'es'} set, {finding.run} run so far
          {finding.waiting > 0 ? `, ${finding.waiting} found and waiting for review` : ''}. New prospects show up here within a few minutes and go to your reps.
        </p>
      ) : finding.searches > 0 ? (
        <p style={{ marginTop: 0 }}>The system can find businesses that fit {client.name} ({finding.searches} search{finding.searches === 1 ? '' : 'es'} ready) and hand them to your reps every day. It is off right now.</p>
      ) : (
        <p style={{ marginTop: 0 }}>Say who {client.name} sells to and where, and the system finds them every day.</p>
      )}
      <div className="actions">
        {isOwner && !client.autopilot && finding.searches > 0 && (
          <ActionForm action={startFinding.bind(null, id)}><button type="submit">Start finding prospects</button></ActionForm>
        )}
        {isOwner && finding.searches === 0 && <Link className="button" href={`/clients/${id}/setup`}>Say who to find</Link>}
        <Link className={`button${!isOwner || finding.searches > 0 ? ' secondary' : ''}`} href={`/clients/${id}/prospects`}>Add prospects yourself</Link>
        {finding.waiting > 0 && <Link className="button secondary" href="/find">Review found businesses</Link>}
      </div>
    </section>
  );

  const opening = client.call_script?.split('\n').find((l) => /^Opening:/i.test(l))?.replace(/^Opening:\s*/i, '').replace('[name]', user.name.split(' ')[0]);
  const toDo = replies.length + calls.length + visits.length + act.drafts;
  const callContext = (l: typeof calls[number]) => {
    const emails = l.touches_sent ?? 0;
    const city = cityOf(l.address);
    const base = reasonFor(l, now) === 'new' ? 'New shop, first call' : `${emails} email${emails === 1 ? '' : 's'} sent, no reply yet`;
    return city ? `${base} · ${city}` : base;
  };

  // Still being set up: guide the owner to the next step instead of showing an empty work screen.
  if (!live) {
    const steps = isOwner ? await setupSteps(client) : [];
    const next = steps.find((s) => !s.done && s.key !== 'live');
    // When approving is the next step, show the email right here with one button to approve it,
    // so it cannot be confused with the other Save buttons on the Settings page.
    const preview = next?.key === 'approve' ? await (async () => {
      const draft = await starterEmail(client);
      const ctx = { firstName: 'Pat', name: 'Sample Shop', city: 'Troy', clientName: client.name, claimUrl: client.claim_url, address: client.mailing_address };
      return { subject: fillEmail(draft.subject, ctx, false).replace(/\n+/g, ' ').trim(), body: ensureFooter(fillEmail(draft.body, ctx), { address: client.mailing_address }) };
    })() : null;
    return (
      <>
        <div className="biz-top">
          <p style={{ margin: 0 }}><Link href="/">Back to businesses</Link></p>
          {isOwner && <Link className="button secondary small" href={`/clients/${id}/settings`}>Settings</Link>}
        </div>
        <h1 style={{ marginBottom: 4 }}>{client.name}</h1>
        <p className="sub" style={{ marginTop: 0 }}>Still setting up</p>
        {saved && <p className="notice" role="status">{saved}.</p>}
        <section className="card checklist">
          <h2 style={{ marginTop: 0 }}>Finish setting up</h2>
          {steps.length > 0 && (
            <ul style={{ marginBottom: 12 }}>
              {steps.filter((s) => s.key !== 'live').map((s, i) => (
                <li key={s.key} className={s.done ? 'done' : ''}>
                  <span className="tickmark" aria-hidden="true">{s.done ? '\u2713' : i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <strong>{s.label}</strong>
                    {!s.done && <div className="task-meta">{s.action}</div>}
                  </div>
                  {!s.done && s === next && <span className="pill missing" style={{ alignSelf: 'center' }}>Next</span>}
                </li>
              ))}
            </ul>
          )}
          {next ? (
            <>
              <p style={{ marginTop: 0 }}>Next: <strong>{next.key === 'approve' ? 'read the first email below and approve it' : next.action.toLowerCase()}</strong>.</p>
              {preview ? (
                <>
                  <div className="card" style={{ background: 'var(--bg)', margin: '0 0 12px' }}>
                    <div className="task-meta" style={{ marginBottom: 6 }}>Example, as a shop called Sample Shop in Troy would get it</div>
                    <p style={{ margin: '0 0 8px' }}><strong>Subject:</strong> {preview.subject}</p>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{preview.body}</div>
                  </div>
                  <div className="actions">
                    <ActionForm action={approveFirstEmail.bind(null, id)}><button type="submit">Approve and start sending</button></ActionForm>
                    <Link className="button secondary" href={`/clients/${id}/settings#approve-h`}>Edit the email first</Link>
                  </div>
                </>
              ) : (
                <Link className="button" href={next.href}>Do it</Link>
              )}
            </>
          ) : (
            <p style={{ marginTop: 0 }}>Everything is ready. Turn on sending from <Link href={`/clients/${id}/settings#approve-h`}>the first email</Link>.</p>
          )}
        </section>
        {!isOwner && <section className="card"><p style={{ margin: 0 }}>The owner is still setting up {client.name}. Its prospects show up in <Link href="/next">Next up</Link> once it is live.</p></section>}
        {totalProspects === 0 && getProspects}
      </>
    );
  }

  return (
    <>
      <div className="biz-top">
        <p style={{ margin: 0 }}><Link href="/">Back to businesses</Link></p>
        {isOwner && <Link className="button secondary small" href={`/clients/${id}/settings`}>Settings</Link>}
      </div>
      <h1 style={{ marginBottom: 4 }}>{client.name}</h1>
      <p className="sub" style={{ marginTop: 0 }}>
        {client.autopilot
          ? <>Running on its own: finding shops and emailing them. <strong>{act.emails_sent}</strong> email{act.emails_sent === 1 ? '' : 's'} sent{act.last_email ? `, last ${act.last_email}` : ''}.</>
          : <>Emailing the prospects it has. New-prospect finding is off. <strong>{act.emails_sent}</strong> email{act.emails_sent === 1 ? '' : 's'} sent.</>}
        {' '}<Link href={`/clients/${id}/settings#approve-h`}>See the email</Link>
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      {totalProspects === 0 || (act.prospects === 0 && act.customers === 0) ? getProspects : toDo === 0 ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>You are caught up</h2>
          <p className="muted" style={{ margin: 0 }}>Nobody needs a call or visit right now. New shops are emailed automatically, and anyone who should be called will show up here on their day.</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="todo-h">
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 id="todo-h" style={{ margin: 0 }}>To do now ({toDo})</h2>
            {(calls.length > 0 || visits.length > 0) && <Link className="button" href={`/next?client=${id}`}>Start, one at a time</Link>}
          </div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>Emails go out on their own. These are the ones that need a person.</p>
        </section>
      )}

      {(replies.length > 0 || act.drafts > 0) && (
        <section className="card" aria-labelledby="replies-h">
          <h2 id="replies-h" style={{ marginTop: 0 }}>Replies to handle{replies.length + act.drafts > 0 ? ` (${replies.length + act.drafts})` : ''}</h2>
          {act.drafts > 0 && <p style={{ marginTop: 0 }}><Link href="/outbox#drafts-h">{act.drafts} repl{act.drafts === 1 ? 'y is' : 'ies are'} drafted and waiting for you to send</Link>.</p>}
          {replies.length > 0 && (
            <ul className="plain-list">
              {replies.map((l) => (
                <li key={l.id} style={{ padding: '6px 0' }}>
                  <strong>{l.name}</strong> replied. {l.phone ? <a href={tel(l.phone)}>Call {l.phone}</a> : 'Call them back.'}
                  {l.last_reply && <div className="task-meta">They wrote: {l.last_reply.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 140)}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {calls.length > 0 && (
        <section className="card" aria-labelledby="calls-h">
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <h2 id="calls-h" style={{ margin: 0 }}>Call these ({calls.length})</h2>
            <Link className="button small" href={`/next?client=${id}`}>Start calling</Link>
          </div>
          {opening && <p className="script-line" style={{ marginTop: 0 }}>&ldquo;{opening}&rdquo;</p>}
          <ul className="plain-list">
            {calls.slice(0, 10).map((l) => (
              <li key={l.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <div className="actions" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <strong>{l.name}</strong>
                  {l.phone && <a className="button small" href={tel(l.phone)}>Call {l.phone}</a>}
                </div>
                <div className="task-meta">{callContext(l)}</div>
              </li>
            ))}
            {calls.length > 10 && <li className="muted" style={{ padding: '6px 0' }}>and {calls.length - 10} more, in &ldquo;Start calling&rdquo;</li>}
          </ul>
        </section>
      )}

      {visits.length > 0 && (
        <section className="card" aria-labelledby="visits-h">
          <h2 id="visits-h" style={{ marginTop: 0 }}>Visit these ({visits.length})</h2>
          <ul className="plain-list">
            {visits.slice(0, 10).map((l) => (
              <li key={l.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <div className="actions" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{l.name}</strong>
                  <span className="actions" style={{ gap: 8 }}>
                    {l.address && routeLink([l.address]) && <a className="button small secondary" href={routeLink([l.address]) ?? undefined} target="_blank" rel="noreferrer">Directions</a>}
                    {l.phone && <a className="button small" href={tel(l.phone)}>Call first</a>}
                  </span>
                </div>
                {l.address && <div className="task-meta">{l.address}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <div className="muted" style={{ fontSize: 14 }}>
            <strong>{act.emails_sent}</strong> emails · <strong>{act.replies}</strong> replies · <strong>{act.prospects}</strong> prospects · <strong>{act.customers}</strong> customers
          </div>
          <Link href={`/clients/${id}/prospects`}>All prospects</Link>
        </div>
      </section>
    </>
  );
}
