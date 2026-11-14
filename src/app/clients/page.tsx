import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { query } from '@/lib/db';
import { getPlay } from '@/lib/plays';
import { setupSteps } from '@/lib/setup';

export const dynamic = 'force-dynamic';

/** Every business as a card: where it is, its live numbers, and the next thing to do. Reps see only theirs. */
export default async function Businesses({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { saved } = await searchParams;

  let clients = (await listClients()).filter((c) => c.status !== 'ended');
  if (!isOwner) {
    const mine = new Set((await query<{ client_id: number }>('SELECT DISTINCT client_id FROM leads WHERE assignee_id = $1', [user.id])).rows.map((r) => r.client_id));
    clients = clients.filter((c) => mine.has(c.id));
  }

  const nextStep = new Map<number, string>();
  if (isOwner) {
    for (const c of clients) {
      const steps = await setupSteps(c);
      const next = steps.find((s) => !s.done && s.key !== 'live');
      if (next) nextStep.set(c.id, next.key === 'approve' ? 'Review and approve the first email' : next.action);
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>{isOwner ? 'Businesses' : 'My businesses'}</h1><p className="sub">Open one to run everything for it.</p></div>
        {isOwner && <div className="right"><Link className="button" href="/clients/new">Add a business</Link></div>}
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}

      {clients.length === 0 ? (
        <section className="card">
          {isOwner
            ? <><p style={{ marginTop: 0 }}>No businesses yet. Add your first one: paste their website, pick a strategy, approve the first email, and it starts finding and contacting prospects.</p><Link className="button" href="/clients/new">Add a business</Link></>
            : <p style={{ margin: 0 }}>You are not on any businesses yet. Your manager will assign you prospects, and they will show up here.</p>}
        </section>
      ) : (
        <div className="biz-list">
          {clients.map((c) => {
            const play = getPlay(c.play);
            const todo = isOwner ? nextStep.get(c.id) : null;
            const pill = c.status === 'paused' ? <span className="pill paused">Paused</span>
              : (isOwner && nextStep.has(c.id)) || !c.outreach_approved_at ? <span className="pill missing">Setting up</span>
              : <span className="pill signed">Live</span>;
            return (
              <Link key={c.id} href={`/clients/${c.id}`} className="card biz-card">
                <div className="biz-head">
                  {c.logo_url ? <img src={c.logo_url} alt="" className="biz-logo" /> : <span className="biz-logo placeholder">{c.name.slice(0, 1)}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="biz-name">{c.name}</strong>
                    <div className="task-meta">{play ? play.name : c.industry || 'No strategy set'}</div>
                  </div>
                  {pill}
                </div>
                <div className="biz-nums">
                  <span><strong>{c.prospects}</strong> in play</span>
                  <span><strong>{c.introduced}</strong> introduced</span>
                  <span><strong>{c.customers}</strong> customers</span>
                </div>
                {todo && <div className="biz-todo">Next: {todo}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
