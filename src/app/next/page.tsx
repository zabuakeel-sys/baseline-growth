import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { leadsForDay, referralAsksDue } from '@/lib/leads';
import { nextQueue, reasonFor } from '@/lib/queue';
import { routeLink, streak } from '@/lib/playbook';
import { cityOf } from '@/lib/leads';
import { today } from '@/lib/work';
import { bookFromQueue, logActivity, setMeetingStatus } from '../sales/actions';
import ActionForm from '../ActionForm';
import { addReferrals } from '../tools/actions';

export const dynamic = 'force-dynamic';

const REASON = {
  replied: { label: 'They replied', hint: 'They are waiting on you. Call now.' },
  call: { label: 'Call', hint: '' },
  visit: { label: 'Visit', hint: 'Stop by and ask for the person who decides.' },
  new: { label: 'New prospect', hint: 'First call. Introduce yourself and the business.' },
} as const;

// Outcome buttons, in the order a rep needs them. "Meeting booked" has its own form (it needs a time).
const BUTTONS: [string, string, string][] = [
  ['no_answer', 'No answer', 'secondary'],
  ['voicemail', 'Left voicemail', 'secondary'],
  ['gatekeeper', 'Gatekeeper', 'secondary'],
  ['talked', 'Talked, follow up', ''],
  ['signed', 'Signed up', ''],
  ['not_interested', 'Not interested', 'secondary'],
  ['wrong_number', 'Wrong number', 'secondary'],
];

const time = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });

/** One prospect at a time, in the order that wins the most business. Log what happened and the next one comes up. */
export default async function NextUp({ searchParams }: { searchParams: Promise<{ skip?: string; skipask?: string; who?: string; saved?: string; client?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { skip = '', skipask = '', who, saved, client } = await searchParams;
  const everyone = isOwner && who === 'all';
  // Focus mode: work just one business's prospects, opened from that business's page.
  const clientId = client && /^\d+$/.test(client) ? Number(client) : null;
  const now = today();
  const all = await leadsForDay(null);
  // Reps see their own prospects. The owner also picks up anything nobody is assigned to.
  const base = everyone ? all : all.filter((l) => l.assignee_id === user.id || (isOwner && l.assignee_id === null));
  const mine = clientId ? base.filter((l) => l.client_id === clientId) : base;
  const clientName = clientId ? (mine[0]?.client_name ?? (await query<{ name: string }>('SELECT name FROM clients WHERE id = $1', [clientId])).rows[0]?.name ?? 'this business') : '';
  const skipped = skip.split(',').filter((s) => /^\d+$/.test(s));
  const queue = nextQueue(mine, now, skipped);
  const lead = queue[0];
  const [done, meetings, allAsks, me, history] = await Promise.all([
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM activities WHERE user_id = $1 AND (created_at AT TIME ZONE 'America/Detroit')::date = $2::date`,
      [user.id, now]).then((r) => r.rows[0].n),
    query<{ id: number; lead_id: number; lead_name: string; client_name: string; starts_at: string; kind: string; location: string; phone: string }>(
      `SELECT m.id, m.lead_id, l.name AS lead_name, c.name AS client_name, to_char(m.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts_at,
         m.kind, m.location, l.phone
       FROM meetings m JOIN leads l ON l.id = m.lead_id JOIN clients c ON c.id = l.client_id
       WHERE m.status = 'scheduled' AND (m.starts_at AT TIME ZONE 'America/Detroit')::date <= $1::date
         ${everyone ? '' : 'AND (m.booked_by = $2 OR l.assignee_id = $2)'} ORDER BY m.starts_at`,
      everyone ? [now] : [now, user.id]).then((r) => r.rows),
    referralAsksDue(everyone ? null : user.id),
    query<{ goal_calls: number; goal_visits: number; goal_meetings: number }>('SELECT goal_calls, goal_visits, goal_meetings FROM users WHERE id = $1', [user.id]).then((r) => r.rows[0]),
    query<{ day: string; calls: number; visits: number; meetings: number }>(
      `SELECT d.day::text AS day,
         (SELECT count(*)::int FROM activities a WHERE a.user_id = $1 AND a.channel = 'call' AND (a.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS calls,
         (SELECT count(*)::int FROM activities a WHERE a.user_id = $1 AND a.channel = 'visit' AND (a.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS visits,
         (SELECT count(*)::int FROM meetings m WHERE m.booked_by = $1 AND (m.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS meetings
       FROM generate_series($2::date - 60, $2::date, interval '1 day') AS d(day)`, [user.id, now]).then((r) => r.rows),
  ]);
  // Goals and streak (set per person on the Team page).
  const goals = { calls: me?.goal_calls ?? 0, visits: me?.goal_visits ?? 0, meetings: me?.goal_meetings ?? 0 };
  const days = Object.fromEntries(history.map((h) => [h.day.slice(0, 10), h]));
  const todayCounts = days[now] ?? { calls: 0, visits: 0, meetings: 0 };
  const run = streak(days, goals, now);
  // Referral asks come after replies and due follow-ups, before cold new prospects: a happy new
  // customer is the warmest source of the next one.
  const skippedAsks = skipask.split(',').filter((x) => /^\d+$/.test(x)).map(Number);
  const asks = [...allAsks.filter((a) => !skippedAsks.includes(a.id)), ...allAsks.filter((a) => skippedAsks.includes(a.id))];
  const ask = !clientId && asks.length && (!queue[0] || reasonFor(queue[0], now) === 'new') ? asks[0] : null;
  const skipAskHref = ask ? `/next?${new URLSearchParams({ ...(everyone ? { who: 'all' } : {}), ...(skip ? { skip } : {}), skipask: [...skippedAsks, ask.id].join(',') })}` : '';
  const toGo = queue.length + asks.length;
  const total = done + toGo;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const backParams = new URLSearchParams();
  if (everyone) backParams.set('who', 'all');
  if (clientId) backParams.set('client', String(clientId));
  const back = `/next${backParams.toString() ? `?${backParams}` : ''}`;
  const skipHref = lead ? `/next?${new URLSearchParams({ ...(everyone ? { who: 'all' } : {}), ...(clientId ? { client: String(clientId) } : {}), skip: [...skipped, String(lead.id)].join(',') })}` : '';
  const reason = lead ? reasonFor(lead, now) : null;
  const channel = reason === 'visit' ? 'visit' : 'call';
  const tel = lead?.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : '';
  const directions = lead?.address ? routeLink([lead.address]) : null;
  const opening = lead?.client_script?.split('\n').find((l) => /^Opening:/.test(l))?.replace(/^Opening:\s*/, '');

  // Progress strip: a calls goal if one is set, otherwise plain "done today".
  const goalCalls = goals.calls;
  const stripBig = goalCalls > 0
    ? <>{todayCounts.calls} <span>/ {goalCalls} calls</span></>
    : <>{done} <span>done today</span></>;
  const stripW = goalCalls > 0 ? Math.min((todayCounts.calls / goalCalls) * 100, 100) : pct;
  const stripMeta = goalCalls > 0 ? `${Math.max(goalCalls - todayCounts.calls, 0)} to go today` : `${toGo} lined up`;
  const dotColor = (r: string) => ({ replied: 'var(--bad)', call: 'var(--accent)', visit: 'var(--warn)', new: 'var(--good)' }[r] ?? 'var(--muted)');
  const ocls = (v: string) => (v === 'signed' ? 'win' : v === 'not_interested' || v === 'wrong_number' ? 'ghost' : '');
  const facts: [string, string][] = [];
  if (lead) {
    facts.push(['Emails', `${lead.touches_sent ?? 0} sent`]);
    if (cityOf(lead.address)) facts.push(['Where', cityOf(lead.address)]);
    if (everyone && lead.assignee_name) facts.push(['Rep', lead.assignee_name]);
  }
  const CallIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 5c0 8 7 15 15 15 1 0 2-1 2-2v-2l-4-2-2 2c-3-1-6-4-7-7l2-2-2-4H6C5 3 4 4 4 5z" /></svg>;

  return (
    <div className="next-up">
      <div className="page-head">
        <div>
          <h1>{clientId ? clientName : 'Today'}</h1>
          <p className="sub">{done} done today · {toGo} to go{clientId && <> · <Link href={`/clients/${clientId}`}>back to {clientName}</Link></>}</p>
        </div>
        {isOwner && !clientId && (
          <div className="right segmented">
            <Link href="/next" aria-current={everyone ? undefined : 'page'}>Mine</Link>
            <Link href="/next?who=all" aria-current={everyone ? 'page' : undefined}>Everyone</Link>
          </div>
        )}
      </div>
      <div className="strip">
        <div className="big">{stripBig}</div>
        <div className="pbar"><i style={{ width: `${stripW}%` }} /></div>
        <div className="meta">{stripMeta}</div>
        {run > 0 && <span className="pill-ok">{run}-day streak</span>}
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}

      {!clientId && meetings.length > 0 && (
        <div className="card meetings-today" style={{ marginBottom: 20 }}>
          <strong>Meetings today</strong>
          <ul className="plain-list" style={{ marginTop: 8 }}>
            {meetings.map((m) => (
              <li key={m.id} style={{ padding: '6px 0' }}>{time(m.starts_at)} · {m.kind} with <strong>{m.lead_name}</strong> ({m.client_name}){m.location ? ` · ${m.location}` : ''}
                {m.phone && <> · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a></>}
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

      {ask ? (
        <article className="focus" aria-labelledby="up-name">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="r-tag r-new"><span className="d"></span>Ask for referrals</span>
            {toGo > 1 && <Link href={skipAskHref} className="muted" style={{ fontSize: 13 }}>Skip for now</Link>}
          </div>
          <div className="who"><span id="up-name">{ask.name}</span></div>
          <p className="muted" style={{ margin: '2px 0 0' }}>New customer of <strong>{ask.client_name}</strong> since {ask.customer_since}</p>
          {ask.phone && <div className="callrow"><a className="call" href={`tel:${ask.phone.replace(/[^\d+]/g, '')}`}><CallIcon /> Call {ask.phone}</a></div>}
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
      ) : !lead ? (
        <div className="done-card">
          <div className="ck">✓</div>
          <h2>You are clear for today</h2>
          <p>Nobody is due{clientId ? ` for ${clientName}` : ''}. New prospects are added every morning, and follow-ups come back on their day. Emails keep going out on their own.</p>
          <p style={{ marginTop: 16 }}>
            {clientId ? <Link className="button secondary" href={`/clients/${clientId}`}>Back to {clientName}</Link> : isOwner && <Link className="button secondary" href="/">Back to Overview</Link>}
          </p>
        </div>
      ) : (
        <div className="work">
          <article className="focus" aria-labelledby="up-name">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`r-tag r-${reason}`}><span className="d"></span>{REASON[reason!].label}</span>
              {queue.length > 1 && <Link href={skipHref} className="muted" style={{ fontSize: 13 }}>Skip</Link>}
            </div>
            <div className="who"><span id="up-name">{lead.name}</span> <span className="co">· {lead.client_name}</span></div>
            {facts.length > 0 && <div className="facts">{facts.map(([k, v], i) => <span key={i}>{k} <b>{v}</b></span>)}</div>}
            {lead.last_reply && lead.last_reply_kind === 'reply' && (
              <div className="opener" style={{ borderLeftColor: 'var(--bad)' }}><div className="q">They wrote</div><p>{lead.last_reply.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 400)}</p></div>
            )}
            {opening && <div className="opener"><div className="q">Suggested opener</div><p>{opening.replace('[your name]', user.name.split(' ')[0])}</p></div>}
            <div className="callrow">
              {tel && <a className="call" href={tel}><CallIcon /> Call {lead.phone}</a>}
              {reason === 'visit' && directions && <a className="button secondary" href={directions} target="_blank" rel="noreferrer">Directions</a>}
              <Link className="button secondary" href={`/call/${lead.id}?from=next`}>Listen and coach me</Link>
            </div>
            <div className="divline"></div>
            <div className="ol">Log what happened — the next one comes right up.</div>
            <ActionForm className="outcome-form" action={logActivity.bind(null, lead.id, back)}>
              <input type="hidden" name="channel" value={channel} />
              <input name="notes" placeholder="Notes (optional): who you spoke to, what they said" aria-label="Notes" style={{ marginBottom: 10 }} />
              <div className="outc">
                {BUTTONS.map(([value, label]) => (
                  <button key={value} type="submit" name="outcome" value={value} className={ocls(value)}>{label}</button>
                ))}
              </div>
            </ActionForm>
            <details className="book" style={{ marginTop: 16 }}>
              <summary><strong>Booked a meeting</strong></summary>
              <ActionForm className="grid" action={bookFromQueue.bind(null, lead.id, back, channel)}>
                <label>What
                  <select name="kind" defaultValue="Walkthrough">
                    <option>Walkthrough</option><option>Call</option><option>Visit</option><option>Demo</option><option>Sign-up</option>
                  </select>
                </label>
                <label>Day<input name="date" type="date" min={now} defaultValue={now} required /></label>
                <label>Time (Michigan)<input name="time" type="time" required /></label>
                <label>Where<input name="location" placeholder="Their office, phone, video" /></label>
                <div className="actions full"><button type="submit">Save meeting</button></div>
              </ActionForm>
            </details>
            {lead.client_script && (
              <details style={{ marginTop: 10 }}><summary className="muted">Full script and answers to objections</summary><pre className="message">{lead.client_script}</pre></details>
            )}
            <p className="task-meta" style={{ marginTop: 12 }}>
              {lead.activity.length > 0 && <>Last: {lead.activity[0].channel} · {lead.activity[0].outcome.replace(/_/g, ' ')} · </>}
              <Link href={`/clients/${lead.client_id}/prospects`}>Full record</Link>
            </p>
          </article>

          <aside className="upnext">
            <h3>Up next</h3>
            {queue.length <= 1 ? <div className="qrow"><span className="muted" style={{ fontSize: 13 }}>Last one — then you are clear.</span></div> : (
              queue.slice(1, 8).map((l) => {
                const r = reasonFor(l, now);
                return <div className="qrow" key={l.id}><span className="d" style={{ background: dotColor(r) }}></span><span className="nm">{l.name}</span><span className="co">{l.client_name}</span></div>;
              })
            )}
            {queue.length > 8 && <div className="qrow"><span className="muted" style={{ fontSize: 13 }}>+{queue.length - 8} more</span></div>}
          </aside>
        </div>
      )}
    </div>
  );
}
