import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { leadsForDay, referralAsksDue, cityOf } from '@/lib/leads';
import { nextQueue, reasonFor } from '@/lib/queue';
import { routeLink } from '@/lib/playbook';
import { today } from '@/lib/work';
import { bookFromQueue, logActivity, setMeetingStatus } from '../sales/actions';
import { addReferrals } from '../tools/actions';
import ActionForm from '../ActionForm';
import type { ReactNode } from 'react';
import type { Lead } from '@/lib/leads';

export const dynamic = 'force-dynamic';

const REASON: Record<string, string> = { replied: 'Replied', call: 'Call', visit: 'Visit', new: 'New shop' };
const BUTTONS: [string, string][] = [
  ['no_answer', 'No answer'], ['voicemail', 'Left voicemail'], ['gatekeeper', 'Gatekeeper'],
  ['talked', 'Talked, follow up'], ['signed', 'Signed up'], ['not_interested', 'Not interested'], ['wrong_number', 'Wrong number'],
];
const time = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const dotColor = (r: string) => ({ replied: 'var(--bad)', call: 'var(--accent)', visit: 'var(--warn)', new: 'var(--good)' }[r] ?? 'var(--muted)');
const ocls = (v: string) => (v === 'signed' ? 'win' : v === 'not_interested' || v === 'wrong_number' ? 'ghost' : '');
const CallIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 5c0 8 7 15 15 15 1 0 2-1 2-2v-2l-4-2-2 2c-3-1-6-4-7-7l2-2-2-4H6C5 3 4 4 4 5z" /></svg>;

/** The salesperson's day: a plain list of who to contact. Open a lead and it shows everything we
 *  researched about them, so the call is easy to win. Automatic emailing runs out of sight. */
export default async function Today({ searchParams }: { searchParams: Promise<{ who?: string; saved?: string; client?: string; lead?: string; ask?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { who, saved, client, lead: leadParam, ask: askParam } = await searchParams;
  const everyone = isOwner && who === 'all';
  const clientId = client && /^\d+$/.test(client) ? Number(client) : null;
  const now = today();
  const all = await leadsForDay(null);
  const base = everyone ? all : all.filter((l) => l.assignee_id === user.id || (isOwner && l.assignee_id === null));
  const mine = clientId ? base.filter((l) => l.client_id === clientId) : base;
  const clientName = clientId ? (mine[0]?.client_name ?? (await query<{ name: string }>('SELECT name FROM clients WHERE id = $1', [clientId])).rows[0]?.name ?? 'this business') : '';
  const queue = nextQueue(mine, now);

  const [meetings, allAsks] = await Promise.all([
    query<{ id: number; lead_id: number; lead_name: string; client_name: string; starts_at: string; kind: string; location: string; phone: string }>(
      `SELECT m.id, m.lead_id, l.name AS lead_name, c.name AS client_name, to_char(m.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts_at, m.kind, m.location, l.phone
       FROM meetings m JOIN leads l ON l.id = m.lead_id JOIN clients c ON c.id = l.client_id
       WHERE m.status = 'scheduled' AND (m.starts_at AT TIME ZONE 'America/Detroit')::date <= $1::date
         ${everyone ? '' : 'AND (m.booked_by = $2 OR l.assignee_id = $2)'} ORDER BY m.starts_at`,
      everyone ? [now] : [now, user.id]).then((r) => r.rows),
    clientId ? Promise.resolve([] as Lead[]) : referralAsksDue(everyone ? null : user.id),
  ]);

  const qp = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (everyone) p.set('who', 'all');
    if (clientId) p.set('client', String(clientId));
    return p.toString();
  };
  const back = `/next${qp({}) ? `?${qp({})}` : ''}`;
  const focusLead = leadParam ? mine.find((l) => l.id === Number(leadParam)) : null;
  const focusAsk = askParam ? allAsks.find((a) => a.id === Number(askParam)) : null;
  const total = queue.length + allAsks.length;

  // Each business keeps its own block: never blend one business's leads into another's.
  // Businesses are ordered by their most urgent lead (the global queue is already priority-ordered).
  const byBiz = new Map<number, { name: string; rows: Lead[]; asks: Lead[] }>();
  const ensure = (id: number, name: string) => {
    let e = byBiz.get(id);
    if (!e) { e = { name, rows: [], asks: [] }; byBiz.set(id, e); }
    return e;
  };
  for (const l of queue) ensure(l.client_id, l.client_name).rows.push(l);
  for (const a of allAsks) ensure(a.client_id, a.client_name).asks.push(a);
  const businesses = [...byBiz.values()];

  const ctx = (l: Lead) => {
    const r = reasonFor(l, now);
    const city = cityOf(l.address);
    const bit = r === 'replied' ? 'Replied — call them back' : r === 'new' ? 'New shop · first call' : r === 'visit' ? (l.address || 'Visit nearby') : `${l.touches_sent} email${l.touches_sent === 1 ? '' : 's'} sent, no reply`;
    return city && r !== 'visit' ? `${bit} · ${city}` : bit;
  };
  const Row = ({ l }: { l: Lead }) => {
    const r = reasonFor(l, now);
    return (
      <Link className="lead-row" href={`/next?${qp({ lead: String(l.id) })}`}>
        <span className="d" style={{ background: dotColor(r) }}></span>
        <div className="lr-main"><div className="lr-name">{l.name}</div><div className="lr-ctx">{ctx(l)}</div></div>
        <span className={`lr-tag r-${r}`}>{REASON[r]}</span>
        <span className="chev">›</span>
      </Link>
    );
  };

  return (
    <div className="next-up">
      <div className="page-head">
        <div>
          <h1>{clientId ? clientName : 'Today'}</h1>
          <p className="sub">{total === 0 ? 'Nobody to contact right now' : `${total} to contact`}{clientId && <> · <Link href={`/clients/${clientId}`}>back to {clientName}</Link></>}</p>
        </div>
        {isOwner && !clientId && !focusLead && !focusAsk && (
          <div className="right segmented">
            <Link href="/next" aria-current={everyone ? undefined : 'page'}>Mine</Link>
            <Link href="/next?who=all" aria-current={everyone ? 'page' : undefined}>Everyone</Link>
          </div>
        )}
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}

      {!focusLead && !focusAsk && !clientId && meetings.length > 0 && (
        <div className="card meetings-today" style={{ marginBottom: 20 }}>
          <strong>Meetings today</strong>
          <ul className="plain-list" style={{ marginTop: 8 }}>
            {meetings.map((m) => (
              <li key={m.id} style={{ padding: '6px 0' }}>{time(m.starts_at)} · {m.kind} with <strong>{m.lead_name}</strong> ({m.client_name}){m.location ? ` · ${m.location}` : ''}
                {m.phone && <> · <a href={tel(m.phone)}>{m.phone}</a></>}
                {new Date(m.starts_at) < new Date() && (
                  <span className="actions" style={{ marginLeft: 8, gap: 6 }}>
                    <span className="muted">How did it go?</span>
                    <form action={setMeetingStatus.bind(null, m.id, 'held', back)}><button type="submit" className="secondary" style={{ padding: '4px 10px', minHeight: 0 }}>Held</button></form>
                    <form action={setMeetingStatus.bind(null, m.id, 'no_show', back)}><button type="submit" className="secondary" style={{ padding: '4px 10px', minHeight: 0 }}>No-show</button></form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {focusAsk ? <ReferralCard ask={focusAsk} back={back} /> : focusLead ? <LeadDetail lead={focusLead} back={back} now={now} userName={user.name} everyone={everyone} /> : total === 0 ? (
        <div className="done-card">
          <div className="ck">✓</div>
          <h2>You are clear for today</h2>
          <p>Nobody needs a call or visit right now{clientId ? ` for ${clientName}` : ''}. New shops are emailed on their own, and anyone who should be called shows up here on their day.</p>
          {clientId && <p style={{ marginTop: 16 }}><Link className="button secondary" href={`/clients/${clientId}`}>Back to {clientName}</Link></p>}
        </div>
      ) : (
        <>
          {businesses.map((b, i) => (
            <section className="card biz-day" key={i}>
              {!clientId && <div className="bd-head"><h2>{b.name}</h2><span className="bd-n">{b.rows.length + b.asks.length}</span></div>}
              {b.rows.map((l) => <Row key={l.id} l={l} />)}
              {b.asks.map((a) => (
                <Link className="lead-row" key={`a${a.id}`} href={`/next?${qp({ ask: String(a.id) })}`}>
                  <span className="d" style={{ background: 'var(--good)' }}></span>
                  <div className="lr-main"><div className="lr-name">{a.name}</div><div className="lr-ctx">New customer since {a.customer_since} · ask for referrals</div></div>
                  <span className="lr-tag r-new">Referrals</span>
                  <span className="chev">›</span>
                </Link>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function LeadDetail({ lead, back, now, userName, everyone }: { lead: Lead; back: string; now: string; userName: string; everyone: boolean }) {
  const reason = reasonFor(lead, now);
  const channel = reason === 'visit' ? 'visit' : 'call';
  const directions = lead.address ? routeLink([lead.address]) : null;
  const opening = lead.client_script?.split('\n').find((l) => /^Opening:/.test(l))?.replace(/^Opening:\s*/, '').replace('[your name]', userName.split(' ')[0]);
  const noteLines = (lead.notes || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const website = noteLines.find((l) => /^https?:\/\//i.test(l));
  const about = noteLines.filter((l) => l !== website).join(' ');
  let host = '';
  try { if (website) host = new URL(website).host.replace(/^www\./, ''); } catch { /* ignore */ }
  const last = lead.activity[0];
  const research: [string, ReactNode][] = [];
  if (lead.contact_name) research.push(['Who to contact', `${lead.contact_name}${lead.contact_title ? ` · ${lead.contact_title}` : ''}`]);
  if (lead.rating || lead.reviews) research.push(['Reputation', `${lead.rating ? `${lead.rating}★` : ''}${lead.rating && lead.reviews ? ' · ' : ''}${lead.reviews ? `${lead.reviews} reviews` : ''}`]);
  if (about) research.push(['About them', about.slice(0, 280)]);
  if (website) research.push(['Website', <a key="w" href={website} target="_blank" rel="noreferrer">{host || website}</a>]);
  if (lead.email) research.push(['Email', lead.email]);
  if (lead.address) research.push(['Address', lead.address]);
  if (lead.need) research.push(['They need', lead.need]);
  research.push(['Our outreach', `${lead.touches_sent} email${lead.touches_sent === 1 ? '' : 's'} sent${last ? ` · last contact ${last.channel} ${last.outcome.replace(/_/g, ' ')}` : ''}`]);

  return (
    <article className="focus" aria-labelledby="up-name">
      <p style={{ margin: '0 0 12px' }}><Link href={back} className="muted">← All leads</Link></p>
      <span className={`r-tag r-${reason}`}><span className="d"></span>{REASON[reason]}</span>
      <div className="who"><span id="up-name">{lead.name}</span> <span className="co">· {lead.client_name}</span></div>

      <div className="research">
        <div className="rh">What we know</div>
        {research.map(([k, v], i) => <div className="rline" key={i}><b>{k}</b><span>{v}</span></div>)}
      </div>

      {lead.last_reply && lead.last_reply_kind === 'reply' && (
        <div className="opener" style={{ borderLeftColor: 'var(--bad)' }}><div className="q">They wrote</div><p>{lead.last_reply.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 400)}</p></div>
      )}
      {opening && <div className="opener"><div className="q">Suggested opener</div><p>{opening}</p></div>}

      <div className="callrow">
        {lead.phone && <a className="call" href={tel(lead.phone)}><CallIcon /> Call {lead.phone}</a>}
        {reason === 'visit' && directions && <a className="button secondary" href={directions} target="_blank" rel="noreferrer">Directions</a>}
        <Link className="button secondary" href={`/call/${lead.id}?from=next`}>Listen and coach me</Link>
      </div>

      <div className="divline"></div>
      <div className="ol">Log what happened — you go back to the list.</div>
      <ActionForm className="outcome-form" action={logActivity.bind(null, lead.id, back)}>
        <input type="hidden" name="channel" value={channel} />
        <input name="notes" placeholder="Notes (optional): who you spoke to, what they said" aria-label="Notes" style={{ marginBottom: 10 }} />
        <div className="outc">
          {BUTTONS.map(([value, label]) => <button key={value} type="submit" name="outcome" value={value} className={ocls(value)}>{label}</button>)}
        </div>
      </ActionForm>
      <details className="book" style={{ marginTop: 16 }}>
        <summary><strong>Booked a meeting</strong></summary>
        <ActionForm className="grid" action={bookFromQueue.bind(null, lead.id, back, channel)}>
          <label>What<select name="kind" defaultValue="Walkthrough"><option>Walkthrough</option><option>Call</option><option>Visit</option><option>Demo</option><option>Sign-up</option></select></label>
          <label>Day<input name="date" type="date" min={now} defaultValue={now} required /></label>
          <label>Time (Michigan)<input name="time" type="time" required /></label>
          <label>Where<input name="location" placeholder="Their office, phone, video" /></label>
          <div className="actions full"><button type="submit">Save meeting</button></div>
        </ActionForm>
      </details>
      {lead.client_script && <details style={{ marginTop: 10 }}><summary className="muted">Full script and answers to objections</summary><pre className="message">{lead.client_script}</pre></details>}
      <p className="task-meta" style={{ marginTop: 12 }}><Link href={`/clients/${lead.client_id}/prospects`}>Full record</Link></p>
    </article>
  );
}

function ReferralCard({ ask, back }: { ask: Lead; back: string }) {
  return (
    <article className="focus" aria-labelledby="up-name">
      <p style={{ margin: '0 0 12px' }}><Link href={back} className="muted">← All leads</Link></p>
      <span className="r-tag r-new"><span className="d"></span>Ask for referrals</span>
      <div className="who"><span id="up-name">{ask.name}</span></div>
      <p className="muted" style={{ margin: '2px 0 0' }}>New customer of <strong>{ask.client_name}</strong> since {ask.customer_since}</p>
      {ask.phone && <div className="callrow"><a className="call" href={tel(ask.phone)}><CallIcon /> Call {ask.phone}</a></div>}
      <div className="opener"><div className="q">Say this</div><p>&ldquo;Glad it is going well. Who else do you know who could use {ask.client_name}? I&apos;ll mention you sent me.&rdquo;</p></div>
      <div className="divline"></div>
      <div className="ol">Add the names they give you.</div>
      <ActionForm className="grid" action={addReferrals.bind(null, ask.id, back)}>
        {[1, 2].map((i) => (
          <div key={i} className="full grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label>Name {i}<input name={`name${i}`} /></label>
            <label>Phone<input name={`phone${i}`} type="tel" /></label>
            <label>Email<input name={`email${i}`} type="email" /></label>
          </div>
        ))}
        <div className="actions full"><button type="submit">Save referrals</button><button type="submit" className="secondary" formNoValidate>They had no one</button></div>
      </ActionForm>
    </article>
  );
}
