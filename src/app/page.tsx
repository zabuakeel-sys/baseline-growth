import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { query } from '@/lib/db';
import { placesConfigured } from '@/lib/places';
import { coachConfigured } from '@/lib/coach';
import { leadsForDay } from '@/lib/leads';
import { nextQueue } from '@/lib/queue';
import { setupSteps } from '@/lib/setup';
import { today } from '@/lib/work';
import ApprovePanel from './clients/ApprovePanel';

export const dynamic = 'force-dynamic';

type Todo = { key: string; what: React.ReactNode; detail?: React.ReactNode; href?: string; button?: string; body?: React.ReactNode };

/** The owner's home: everything that needs them, in order, each with the one button that deals with it. */
export default async function Home({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/next');
  const { saved } = await searchParams;
  const now = today();
  const clients = (await listClients()).filter((c) => c.status !== 'ended');
  const all = await leadsForDay(null);
  const myQueue = nextQueue(all.filter((l) => l.assignee_id === user.id || l.assignee_id === null), now);

  const [drafts, failed, reps, toHandOver, week] = await Promise.all([
    query<{ id: number; lead_name: string; client_name: string }>(
      `SELECT o.id, l.name AS lead_name, c.name AS client_name FROM outbox o JOIN leads l ON l.id = o.lead_id JOIN clients c ON c.id = l.client_id
       WHERE o.kind = 'reply' AND o.status = 'pending' ORDER BY o.created_at`).then((r) => r.rows),
    query<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE status = 'failed'").then((r) => r.rows[0].n),
    query<{ id: number; name: string; overdue: number }>(
      `SELECT u.id, u.name, (SELECT count(*)::int FROM leads l WHERE l.assignee_id = u.id AND l.status IN ('new', 'following_up', 'talking', 'introduced')
         AND l.next_action_on < $1::date - 1) AS overdue FROM users u WHERE u.role = 'team' ORDER BY u.name`, [now]).then((r) => r.rows),
    query<{ id: number; name: string; client_id: number; client_name: string }>(
      `SELECT l.id, l.name, c.id AS client_id, c.name AS client_name FROM leads l JOIN clients c ON c.id = l.client_id
       WHERE l.status = 'talking' AND l.handed_over_at IS NULL AND EXISTS (SELECT 1 FROM meetings m WHERE m.lead_id = l.id AND m.status = 'held')`).then((r) => r.rows),
    query<{ emails: number; replies: number; calls: number; meetings: number; customers: number }>(
      `SELECT (SELECT count(*)::int FROM outbox WHERE status = 'sent' AND kind = 'sequence' AND sent_at > now() - interval '7 days') AS emails,
              (SELECT count(*)::int FROM replies WHERE kind = 'reply' AND received_at > now() - interval '7 days') AS replies,
              (SELECT count(*)::int FROM activities WHERE channel IN ('call', 'visit') AND created_at > now() - interval '7 days') AS calls,
              (SELECT count(*)::int FROM meetings WHERE created_at > now() - interval '7 days') AS meetings,
              (SELECT count(*)::int FROM leads WHERE status = 'won' AND customer_since > $1::date - 7) AS customers`, [now]).then((r) => r.rows[0]),
  ]);

  const todos: Todo[] = [];
  if (!clients.length) todos.push({ key: 'first', what: 'Add your first business', detail: 'Ask the owner the questions; the system sets up the rest.', href: '/clients/new', button: 'Add a business' });
  for (const d of drafts) {
    todos.push({ key: `d${d.id}`, what: <>Reply to <strong>{d.lead_name}</strong> is drafted</>, detail: `${d.client_name}. Read it, edit if needed, send.`, href: '/outbox#drafts-h', button: 'Review reply' });
  }
  for (const c of clients) {
    const steps = await setupSteps(c);
    const next = steps.find((s) => !s.done && s.key !== 'live');
    if (!next) continue;
    if (next.key === 'approve') {
      todos.push({ key: `a${c.id}`, what: <><strong>{c.name}</strong>: approve the first email</>, detail: 'Once approved, its outreach sends on its own.', body: <ApprovePanel client={c} back="/" /> });
    } else {
      todos.push({ key: `s${c.id}`, what: <><strong>{c.name}</strong>: {next.action.toLowerCase()}</>, detail: `Setup step ${steps.indexOf(next) + 1} of 3.`, href: next.href, button: 'Do it' });
    }
  }
  for (const l of toHandOver) {
    todos.push({ key: `h${l.id}`, what: <>Hand <strong>{l.name}</strong> over to {l.client_name}</>, detail: 'The meeting was held. Introduce them so the client can close.', href: `/clients/${l.client_id}#leads-h`, button: 'Open' });
  }
  if (failed) todos.push({ key: 'failed', what: `${failed} email${failed === 1 ? '' : 's'} failed to send`, detail: 'Usually a mailbox password or limit problem.', href: '/outbox', button: 'See why' });
  for (const r of reps.filter((x) => x.overdue >= 5)) {
    todos.push({ key: `r${r.id}`, what: <><strong>{r.name}</strong> has {r.overdue} overdue calls and visits</>, detail: 'Check in with them, or reassign.', href: '/team', button: 'Team' });
  }
  if (!reps.length && clients.length) todos.push({ key: 'reps', what: 'Add a sales rep', detail: 'Until then, every prospect comes to your Next up.', href: '/team', button: 'Add a rep' });
  if (clients.length && !placesConfigured()) todos.push({ key: 'places', what: 'Connect business search', detail: <>Add <code>GOOGLE_PLACES_API_KEY</code> in Railway (with a budget alert) so new prospects are found every day.</> });
  if (clients.length && !coachConfigured()) todos.push({ key: 'ai', what: 'Connect AI (optional)', detail: <>Add <code>ANTHROPIC_API_KEY</code> in Railway for personal first lines, reply drafts and the live call coach.</> });

  return (
    <>
      <h1>Home</h1>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <section className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 18 }}>{myQueue.length ? `${myQueue.length} call${myQueue.length === 1 ? '' : 's'} and visits for you today` : 'Nothing due for you today'}</strong>
          <div className="muted" style={{ fontSize: 14 }}>Your own prospects, plus any nobody is assigned to.</div>
        </div>
        <Link className="button big" href="/next">{myQueue.length ? 'Start Next up' : 'Open Next up'}</Link>
      </section>

      <section className="card" aria-labelledby="todo-h">
        <h2 id="todo-h">{todos.length ? `Needs you (${todos.length})` : 'Nothing needs you'}</h2>
        {todos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Everything is running. Prospects are found, emailed and followed up on their own.</p> : (
          <ul className="todo">
            {todos.map((t) => (
              <li key={t.key}>
                <div className="what">
                  <div>{t.what}</div>
                  {t.detail && <div className="task-meta">{t.detail}</div>}
                  {t.body && <div style={{ marginTop: 8 }}>{t.body}</div>}
                </div>
                {t.href && <Link className="button secondary" href={t.href}>{t.button ?? 'Open'}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 style={{ fontSize: 17 }}>Last 7 days</h2>
      <div className="stats">
        <div className="stat"><div className="label">Emails sent</div><div className="value">{week.emails}</div></div>
        <div className="stat"><div className="label">Replies</div><div className="value">{week.replies}</div></div>
        <div className="stat"><div className="label">Calls and visits</div><div className="value">{week.calls}</div></div>
        <div className="stat"><div className="label">Meetings booked</div><div className="value">{week.meetings}</div></div>
        <div className="stat"><div className="label">New customers</div><div className="value">{week.customers}</div></div>
      </div>
    </>
  );
}
