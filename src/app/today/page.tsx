import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { cityOf, leadsForDay } from '@/lib/leads';
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
  const [leads, meetings, tasks] = await Promise.all([
    leadsForDay(everyone ? null : user.id),
    query<Meeting>(
      `SELECT m.id, m.lead_id, l.name AS lead_name, c.id AS client_id, c.name AS client_name,
         to_char(m.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts_at, m.kind, m.location, l.phone
       FROM meetings m JOIN leads l ON l.id = m.lead_id JOIN clients c ON c.id = l.client_id
       WHERE m.status = 'scheduled' AND (m.starts_at AT TIME ZONE 'America/Detroit')::date BETWEEN $1::date AND $1::date + 1
         ${everyone ? '' : 'AND (m.booked_by = $2 OR l.assignee_id = $2)'}
       ORDER BY m.starts_at`, everyone ? [now] : [now, user.id]).then((r) => r.rows),
    openTasks(everyone ? {} : { assigneeId: user.id }),
  ]);

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
          [...byCity].map(([city, list]) => (
            <details key={city} open={byCity.size <= 2}>
              <summary><strong>{city}</strong> <span className="muted">({list.length})</span></summary>
              {list.map(card)}
            </details>
          ))
        )}
      </section>
      {tasksDue.length > 0 && (
        <section className="card" aria-labelledby="tasks-h">
          <h2 id="tasks-h">Other tasks due</h2>
          <TaskList tasks={tasksDue} back={back} showClient today={now} />
        </section>
      )}
    </>
  );
}
