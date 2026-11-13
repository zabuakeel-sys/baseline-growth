import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { leadsForDay, referralAsksDue } from '@/lib/leads';
import { nextQueue, reasonFor } from '@/lib/queue';
import { brief, goalProgress, routeLink, streak } from '@/lib/playbook';
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
export default async function NextUp({ searchParams }: { searchParams: Promise<{ skip?: string; skipask?: string; who?: string; saved?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { skip = '', skipask = '', who, saved } = await searchParams;
  const everyone = isOwner && who === 'all';
  const now = today();
  const all = await leadsForDay(null);
  // Reps see their own prospects. The owner also picks up anything nobody is assigned to.
  const mine = everyone ? all : all.filter((l) => l.assignee_id === user.id || (isOwner && l.assignee_id === null));
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
  const progress = goalProgress(todayCounts, goals);
  const run = streak(days, goals, now);
  const hasGoals = !everyone && goals.calls + goals.visits + goals.meetings > 0;
  // Referral asks come after replies and due follow-ups, before cold new prospects: a happy new
  // customer is the warmest source of the next one.
  const skippedAsks = skipask.split(',').filter((x) => /^\d+$/.test(x)).map(Number);
  const asks = [...allAsks.filter((a) => !skippedAsks.includes(a.id)), ...allAsks.filter((a) => skippedAsks.includes(a.id))];
  const ask = asks.length && (!queue[0] || reasonFor(queue[0], now) === 'new') ? asks[0] : null;
  const skipAskHref = ask ? `/next?${new URLSearchParams({ ...(everyone ? { who: 'all' } : {}), ...(skip ? { skip } : {}), skipask: [...skippedAsks, ask.id].join(',') })}` : '';
  const toGo = queue.length + asks.length;
  const total = done + toGo;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const back = `/next${everyone ? '?who=all' : ''}`;
  const skipHref = lead ? `/next?${new URLSearchParams({ ...(everyone ? { who: 'all' } : {}), skip: [...skipped, String(lead.id)].join(',') })}` : '';
  const reason = lead ? reasonFor(lead, now) : null;
  const channel = reason === 'visit' ? 'visit' : 'call';
  const tel = lead?.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : '';
  const directions = lead?.address ? routeLink([lead.address]) : null;
  const opening = lead?.client_script?.split('\n').find((l) => /^Opening:/.test(l))?.replace(/^Opening:\s*/, '');

  return (
    <div className="next-up">
      <div className="next-top">
        <div>
          <h1 style={{ margin: 0 }}>Next up</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>{done} done today · {toGo} to go</p>
        </div>
        {isOwner && (
          <div className="segmented">
            <Link href="/next" className={everyone ? '' : 'on'}>Mine</Link>
            <Link href="/next?who=all" className={everyone ? 'on' : ''}>Everyone</Link>
          </div>
        )}
      </div>
      {hasGoals ? (
        <div className="goals" aria-label="Today's goals" style={{ marginTop: 12 }}>
          {([['calls', 'Calls'], ['visits', 'Visits'], ['meetings', 'Meetings booked']] as const).filter(([k]) => goals[k] > 0).map(([k, label]) => (
            <div key={k} className={`goal${(progress[k] ?? 0) >= 100 ? ' met' : ''}`}>
              <div className="label">{label}: <strong>{todayCounts[k]}</strong> of {goals[k]}</div>
              <div className="bar"><div style={{ width: `${progress[k] ?? 0}%` }} /></div>
            </div>
          ))}
          <div className="goal"><div className="label">Streak</div><strong style={{ fontSize: 20 }}>{run} day{run === 1 ? '' : 's'}</strong></div>
        </div>
      ) : (
        <div className="progress" aria-label={`${pct}% of today done`}><div style={{ width: `${pct}%` }} /></div>
      )}
      {saved && <p className="notice" role="status">{saved}.</p>}

      {meetings.length > 0 && (
        <div className="card meetings-today">
          <strong>Meetings</strong>
          <ul className="plain-list">
            {meetings.map((m) => (
              <li key={m.id} style={{ padding: '4px 0' }}>{time(m.starts_at)} · {m.kind} with <strong>{m.lead_name}</strong> ({m.client_name}){m.location ? ` · ${m.location}` : ''}
                {m.phone && <> · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a></>}
                {new Date(m.starts_at) < new Date() && (
                  <span className="actions inline-actions">
                    <span className="muted">How did it go?</span>
                    <form action={setMeetingStatus.bind(null, m.id, 'held', back)}><button type="submit" className="small">Held</button></form>
                    <form action={setMeetingStatus.bind(null, m.id, 'no_show', back)}><button type="submit" className="secondary small">No-show</button></form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ask ? (
        <article className="card up-card" aria-labelledby="up-name">
          <div className="up-head">
            <span className="pill signed">Ask for referrals</span>
            {toGo > 1 && <Link href={skipAskHref} className="muted small-link">Skip for now</Link>}
          </div>
          <h2 id="up-name" className="up-name">{ask.name}</h2>
          <p className="muted" style={{ margin: 0 }}>New customer of <strong>{ask.client_name}</strong> since {ask.customer_since}</p>
          <p className="up-why">Happy new customers know others like them. Ask for two names while the win is fresh.</p>
          {ask.phone && <div className="big-actions"><a className="button big" href={`tel:${ask.phone.replace(/[^\d+]/g, '')}`}>Call {ask.phone}</a></div>}
          <p className="script-line">&ldquo;Glad it is going well. Who else do you know who could use {ask.client_name}? I&apos;ll mention you sent me.&rdquo;</p>
          <ActionForm className="grid" action={addReferrals.bind(null, ask.id, back)}>
            {[1, 2].map((i) => (
              <div key={i} className="full grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <label>Name {i}<input name={`name${i}`} /></label>
                <label>Phone<input name={`phone${i}`} type="tel" /></label>
                <label>Email<input name={`email${i}`} type="email" /></label>
              </div>
            ))}
            <div className="outcome-buttons full">
              <button type="submit">Save referrals</button>
              <button type="submit" className="secondary" formNoValidate>They had no one</button>
            </div>
          </ActionForm>
        </article>
      ) : !lead ? (
        <div className="card done-card">
          <h2>You are done for now</h2>
          <p className="muted" style={{ margin: 0 }}>
            Nobody is due. New prospects are added every morning and follow-ups come back on their day.
            {isOwner && <> Check <Link href="/">Home</Link> for anything waiting on you.</>}
          </p>
        </div>
      ) : (
        <article className="card up-card" aria-labelledby="up-name">
          <div className="up-head">
            <span className={`pill reason-${reason}`}>{REASON[reason!].label}</span>
            {queue.length > 1 && <Link href={skipHref} className="muted small-link">Skip for now</Link>}
          </div>
          <h2 id="up-name" className="up-name">{lead.name}</h2>
          <p className="muted" style={{ margin: 0 }}>
            For <strong>{lead.client_name}</strong>{cityOf(lead.address) ? ` · ${cityOf(lead.address)}` : ''}
            {lead.assignee_name && everyone ? ` · ${lead.assignee_name}` : ''}
          </p>
          <p className="up-why">{reason === 'replied' || reason === 'new' || reason === 'visit' ? REASON[reason].hint : lead.next_action || 'Follow up'}</p>

          <div className="big-actions">
            {tel && <a className="button big" href={tel}>Call {lead.phone}</a>}
            {reason === 'visit' && directions && <a className="button big secondary" href={directions} target="_blank" rel="noreferrer">Directions</a>}
            <Link className="button big secondary" href={`/call/${lead.id}?from=next`}>Listen and coach me</Link>
          </div>

          {lead.last_reply && lead.last_reply_kind === 'reply' && (
            <blockquote className="reply-text"><span className="task-meta">They wrote: </span>{lead.last_reply.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 600)}</blockquote>
          )}
          {opening && <p className="script-line">&ldquo;{opening.replace('[your name]', user.name.split(' ')[0])}&rdquo;</p>}
          <ul className="brief" aria-label="What we know">
            {brief(lead as unknown as Record<string, unknown>).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          {lead.client_script && (
            <details><summary>Full script and answers to objections</summary><pre className="message">{lead.client_script}</pre></details>
          )}

          <h3 className="what-happened">What happened?</h3>
          <ActionForm className="outcome-form" action={logActivity.bind(null, lead.id, back)}>
            <input type="hidden" name="channel" value={channel} />
            <input name="notes" placeholder="Notes (optional): who you spoke to, what they said" aria-label="Notes" />
            <div className="outcome-buttons">
              {BUTTONS.map(([value, label, cls]) => (
                <button key={value} type="submit" name="outcome" value={value} className={cls}>{label}</button>
              ))}
            </div>
          </ActionForm>
          <details className="book">
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
          {lead.activity.length > 0 && (
            <p className="task-meta" style={{ marginTop: 12 }}>
              Last time: {lead.activity[0].channel} · {lead.activity[0].outcome.replace(/_/g, ' ')}{lead.activity[0].notes ? ` · "${lead.activity[0].notes}"` : ''}
            </p>
          )}
          <p className="task-meta" style={{ marginTop: 8 }}>
            <Link href={`/clients/${lead.client_id}#leads-h`}>Full record</Link>
          </p>
        </article>
      )}
      {queue.length > 1 && (
        <p className="muted" style={{ fontSize: 14 }}>
          After this: {queue.slice(1, 4).map((l) => l.name).join(', ')}{queue.length > 4 ? ` and ${queue.length - 4} more` : ''}.
        </p>
      )}
    </div>
  );
}
