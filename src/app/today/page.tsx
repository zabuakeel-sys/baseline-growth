import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { cityOf, leadsForDay, referralAsksDue } from '@/lib/leads';
import { goalProgress, routeLink, streak } from '@/lib/playbook';
import { addReferrals } from '../tools/actions';
import ActionForm from '../ActionForm';
import { openTasks, today } from '@/lib/work';
import LeadCard from '../leads/LeadCard';
import TaskList from '../work/TaskList';

export const dynamic = 'force-dynamic';

type Meeting = { id: number; lead_id: number; lead_name: string; client_id: number; client_name: string; starts_at: string; kind: string; location: string; phone: string };
const time = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ who?: string; saved?: string }> }) {
  const user = await requireUser();
  const { who, saved } = await searchParams;
  const everyone = who === 'all';
  const now = today();
  const back = everyone ? '/today?who=all' : '/today';
  const [leads, meetings, tasks, asks, me, history] = await Promise.all([
    leadsForDay(everyone ? null : user.id),
    query<Meeting>(
      `SELECT m.id, m.lead_id, l.name AS lead_name, c.id AS client_id, c.name AS client_name,
         to_char(m.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts_at, m.kind, m.location, l.phone
       FROM meetings m JOIN leads l ON l.id = m.lead_id JOIN clients c ON c.id = l.client_id
       WHERE m.status = 'scheduled' AND (m.starts_at AT TIME ZONE 'America/Detroit')::date BETWEEN $1::date AND $1::date + 1
         ${everyone ? '' : 'AND (m.booked_by = $2 OR l.assignee_id = $2)'}
       ORDER BY m.starts_at`, everyone ? [now] : [now, user.id]).then((r) => r.rows),
    openTasks(everyone ? {} : { assigneeId: user.id }),
    referralAsksDue(everyone ? null : user.id),
    query<{ goal_calls: number; goal_visits: number; goal_meetings: number }>('SELECT goal_calls, goal_visits, goal_meetings FROM users WHERE id = $1', [user.id]).then((r) => r.rows[0]),
    // The last 60 days of this rep's activity, per Michigan day, for goals and the streak.
    query<{ day: string; calls: number; visits: number; meetings: number }>(
      `SELECT d.day::text AS day,
         (SELECT count(*)::int FROM activities a WHERE a.user_id = $1 AND a.channel = 'call' AND (a.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS calls,
         (SELECT count(*)::int FROM activities a WHERE a.user_id = $1 AND a.channel = 'visit' AND (a.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS visits,
         (SELECT count(*)::int FROM meetings m WHERE m.booked_by = $1 AND (m.created_at AT TIME ZONE 'America/Detroit')::date = d.day) AS meetings
       FROM generate_series($2::date - 60, $2::date, interval '1 day') AS d(day)`, [user.id, now]).then((r) => r.rows),
  ]);
  const goals = { calls: me?.goal_calls ?? 0, visits: me?.goal_visits ?? 0, meetings: me?.goal_meetings ?? 0 };
  const days = Object.fromEntries(history.map((h) => [h.day.slice(0, 10), h]));
  const todayCounts = days[now] ?? { calls: 0, visits: 0, meetings: 0 };
  const progress = goalProgress(todayCounts, goals);
  const run = streak(days, goals, now);
  const hasGoals = goals.calls + goals.visits + goals.meetings > 0;

  // 1. Replies first: someone answered and is waiting. 2. Overdue and due-today next steps.
  const replied = leads.filter((l) => l.next_action.startsWith('They replied') && l.next_action_on && l.next_action_on <= now);
  const due = leads.filter((l) => !replied.includes(l) && l.next_action_on && l.next_action_on <= now);
  // 3. Fresh prospects with a phone and no next step yet: the call and visit list, grouped by city.
  const fresh = leads.filter((l) => !l.next_action_on && l.phone && (l.status === 'new' || l.status === 'following_up') && l.activity.length === 0);
  const byCity = new Map<string, typeof fresh>();
  for (const l of fresh.slice(0, 60)) {
    const city = cityOf(l.address) || 'No address';
    byCity.set(city, [...(byCity.get(city) ?? []), l]);
  }
  const tasksDue = tasks.filter((t) => t.due_on && t.due_on <= now);
  const card = (l: (typeof leads)[number]) => <LeadCard key={l.id} lead={l} back={back} senderName={user.name} today={now} showClient />;

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Today</h1>
          <p className="sub" style={{ margin: 0 }}>Work top to bottom: replies first, then callbacks, then new calls and visits. Log every one.</p>
        </div>
        <div className="segmented" role="group" aria-label="Whose list">
          <Link href="/today" aria-current={!everyone ? 'true' : undefined}>Mine</Link>
          <Link href="/today?who=all" aria-current={everyone ? 'true' : undefined}>Everyone</Link>
        </div>
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}
      {hasGoals && !everyone && (
        <div className="goals" aria-label="Today's goals">
          {([['calls', 'Calls'], ['visits', 'Visits'], ['meetings', 'Meetings booked']] as const).filter(([k]) => goals[k] > 0).map(([k, label]) => (
            <div key={k} className={`goal${(progress[k] ?? 0) >= 100 ? ' met' : ''}`}>
              <div className="label">{label}: <strong>{todayCounts[k]}</strong> of {goals[k]}</div>
              <div className="bar"><div style={{ width: `${progress[k] ?? 0}%` }} /></div>
            </div>
          ))}
          <div className="goal"><div className="label">Streak</div><strong style={{ fontSize: 20 }}>{run} day{run === 1 ? '' : 's'}</strong></div>
        </div>
      )}

      <div className="stats">
        <div className="stat"><div className="label">Replies waiting</div><div className={`value${replied.length ? ' late' : ''}`}>{replied.length}</div></div>
        <div className="stat"><div className="label">Callbacks due</div><div className="value">{due.length}</div></div>
        <div className="stat"><div className="label">Meetings today and tomorrow</div><div className="value">{meetings.length}</div></div>
        <div className="stat"><div className="label">New to call or visit</div><div className="value">{fresh.length}</div></div>
      </div>

      {replied.length > 0 && (
        <section className="card urgent" aria-labelledby="replied-h">
          <h2 id="replied-h">1. They replied: call now</h2>
          {replied.map(card)}
        </section>
      )}
      {meetings.length > 0 && (
        <section className="card" aria-labelledby="meet-h">
          <h2 id="meet-h">Meetings</h2>
          <ul className="plain-list">
            {meetings.map((m) => (
              <li key={m.id}>
                <strong>{time(m.starts_at)}</strong> · {m.kind} with <Link href={`/clients/${m.client_id}#leads-h`}>{m.lead_name}</Link>
                <span className="muted"> · {m.client_name}{m.location ? ` · ${m.location}` : ''}</span>
                {m.phone && <> · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a></>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-labelledby="due-h">
        <h2 id="due-h">2. Callbacks and next steps due</h2>
        {due.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing due. Move on to new calls and visits.</p> : due.map(card)}
      </section>
      <section className="card" aria-labelledby="new-h">
        <h2 id="new-h">3. New to call or visit</h2>
        {fresh.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No fresh prospects. <Link href="/find">Find more</Link>.</p>
        ) : (
          [...byCity].map(([city, list]) => {
            const route = routeLink(list.map((l) => l.address));
            return (
              <details key={city} open={byCity.size <= 2}>
                <summary><strong>{city}</strong> <span className="muted">({list.length})</span></summary>
                {route && city !== 'No address' && (
                  <p style={{ margin: '8px 0' }}>
                    <a className="button secondary small" href={route} target="_blank" rel="noopener noreferrer">
                      Route {Math.min(list.filter((l) => l.address).length, 10)} visits in Google Maps
                    </a>
                  </p>
                )}
                {list.map(card)}
              </details>
            );
          })
        )}
      </section>
      {asks.length > 0 && (
        <section className="card" aria-labelledby="ask-h">
          <h2 id="ask-h">Ask your new customers for referrals</h2>
          <p className="muted" style={{ marginTop: 0 }}>Happy new customers know others like them. Ask for two names while the win is fresh.</p>
          {asks.map((c) => (
            <details key={c.id} className="ask">
              <summary><strong>{c.name}</strong> <span className="muted">· {c.client_name} · customer since {c.customer_since}</span></summary>
              <ActionForm className="grid" action={addReferrals.bind(null, c.id, back)}>
                {[1, 2].map((i) => (
                  <div key={i} className="full grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <label>Referral {i} name<input name={`name${i}`} /></label>
                    <label>Phone<input name={`phone${i}`} type="tel" /></label>
                    <label>Email<input name={`email${i}`} type="email" /></label>
                  </div>
                ))}
                <div className="actions full">
                  <button type="submit">Save referrals</button>
                  <span className="muted">Saving with no names marks them as asked.</span>
                </div>
              </ActionForm>
            </details>
          ))}
        </section>
      )}
      {tasksDue.length > 0 && (
        <section className="card" aria-labelledby="tasks-h">
          <h2 id="tasks-h">Other tasks due</h2>
          <TaskList tasks={tasksDue} back={back} showClient today={now} />
        </section>
      )}
    </>
  );
}
