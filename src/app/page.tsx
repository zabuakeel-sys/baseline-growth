import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { query } from '@/lib/db';
import { getPlay } from '@/lib/plays';
import { setupSteps } from '@/lib/setup';

export const dynamic = 'force-dynamic';

/**
 * Home is the list of businesses. Each card shows where the business is (setting up, live, paused),
 * its live numbers, and the one thing that needs doing next. Open a business to run everything for it.
 * Reps see only the businesses they are on.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { saved } = await searchParams;

  let clients = (await listClients()).filter((c) => c.status !== 'ended');
  // A rep sees only businesses they have prospects on.
  if (!isOwner) {
    const mine = new Set((await query<{ client_id: number }>(
      'SELECT DISTINCT client_id FROM leads WHERE assignee_id = $1', [user.id])).rows.map((r) => r.client_id));
    clients = clients.filter((c) => mine.has(c.id));
  }

  // Per-business: how many replies are drafted and waiting (owner handles these).
  const draftCounts = isOwner
    ? Object.fromEntries((await query<{ client_id: number; n: number }>(
        `SELECT l.client_id, count(*)::int AS n FROM outbox o JOIN leads l ON l.id = o.lead_id
         WHERE o.kind = 'reply' AND o.status = 'pending' GROUP BY l.client_id`).then((r) => r.rows)).map((r) => [r.client_id, r.n]))
    : {};
  const failed = isOwner ? (await query<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE status = 'failed'")).rows[0].n : 0;

  // The next setup step per business (owner only), so the card can show "finish setup".
  const nextStep = new Map<number, string>();
  if (isOwner) {
    for (const c of clients) {
      const steps = await setupSteps(c);
      const next = steps.find((s) => !s.done && s.key !== 'live');
      if (next) nextStep.set(c.id, next.key === 'approve' ? 'Review and approve the first email' : next.action);
    }
  }

  const statusPill = (c: (typeof clients)[number]) => {
    if (c.status === 'paused') return <span className="pill">Paused</span>;
    if (isOwner && nextStep.has(c.id)) return <span className="pill missing">Setting up</span>;
    if (!c.outreach_approved_at) return <span className="pill missing">Setting up</span>;
    return <span className="pill signed">Live</span>;
  };

  return (
    <>
      <div className="next-top">
        <h1 style={{ margin: 0 }}>{isOwner ? 'Your businesses' : 'My businesses'}</h1>
        {isOwner && <Link className="button" href="/clients/new">Add a business</Link>}
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}
      {failed > 0 && (
        <p className="error" role="status">{failed} email{failed === 1 ? '' : 's'} failed to send. <Link href="/outbox">See why</Link>.</p>
      )}

      {clients.length === 0 ? (
        <section className="card">
          {isOwner ? (
            <>
              <p style={{ marginTop: 0 }}>No businesses yet. Add your first one: paste their website, pick a strategy, approve the first email, and the system starts finding and contacting prospects.</p>
              <Link className="button" href="/clients/new">Add a business</Link>
            </>
          ) : (
            <p style={{ margin: 0 }}>You are not on any businesses yet. Your manager will assign you prospects, and they will show up here.</p>
          )}
        </section>
      ) : (
        <div className="biz-list">
          {clients.map((c) => {
            const play = getPlay(c.play);
            const drafts = draftCounts[c.id] ?? 0;
            const todo = isOwner ? nextStep.get(c.id) : null;
            return (
              <Link key={c.id} href={`/clients/${c.id}`} className="card biz-card">
                <div className="biz-head">
                  {c.logo_url ? <img src={c.logo_url} alt="" className="biz-logo" /> : <span className="biz-logo placeholder">{c.name.slice(0, 1)}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="biz-name">{c.name}</strong>
                    <div className="task-meta">{play ? play.name : c.industry || 'No strategy set'}</div>
                  </div>
                  {statusPill(c)}
                </div>
                <div className="biz-nums">
                  <span><strong>{c.prospects}</strong> in play</span>
                  <span><strong>{c.introduced}</strong> introduced</span>
                  <span><strong>{c.customers}</strong> customers</span>
                </div>
                {todo ? (
                  <div className="biz-todo">Next: {todo}</div>
                ) : drafts > 0 ? (
                  <div className="biz-todo">{drafts} repl{drafts === 1 ? 'y' : 'ies'} waiting for you to send</div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
