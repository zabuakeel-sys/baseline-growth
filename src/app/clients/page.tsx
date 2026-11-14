import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { setupSteps } from '@/lib/setup';

export const dynamic = 'force-dynamic';

/** Every business we sell for: where it is in setup, and what it has produced. */
export default async function Businesses({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const isOwner = user.role === 'owner';
  const clients = await listClients();
  const rows = await Promise.all(clients.map(async (c) => {
    const steps = c.status === 'ended' ? [] : await setupSteps(c);
    const next = steps.find((s) => !s.done);
    return { c, state: c.status === 'ended' ? 'Ended' : !next ? 'Live' : next.key === 'live' ? 'Starting' : `Setup: ${next.label.toLowerCase()}` };
  }));
  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>Businesses</h1>
          <p className="sub" style={{ margin: 0 }}>We find each one new customers and share in what those customers pay.</p>
        </div>
        {isOwner && <Link className="button" href="/clients/new">Add a business</Link>}
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}
      <div className="card table-wrap">
        {clients.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No businesses yet. {isOwner ? <Link href="/clients/new">Add your first one</Link> : 'The owner adds them.'}</p>
        ) : (
          <table>
            <thead><tr><th>Business</th><th>Status</th><th className="num">Prospects</th><th className="num">With them now</th><th className="num">Customers</th></tr></thead>
            <tbody>
              {rows.map(({ c, state }) => (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`}>{c.name}</Link><div className="muted" style={{ fontSize: 13 }}>{c.industry}</div></td>
                  <td><span className={`pill ${state === 'Live' ? 'signed' : state === 'Ended' ? 'ended' : ''}`}>{state}</span></td>
                  <td className="num">{c.prospects}</td>
                  <td className="num">{c.introduced}</td>
                  <td className="num">{c.customers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Looking for a specific prospect? <Link href="/leads">All prospects</Link>
        {isOwner && <> · <Link href="/outbox">Emails and replies</Link> · <Link href="/find">Search by hand</Link> · <Link href="/partners">Referral partners</Link> · <Link href="/insights">Insights</Link></>}
      </p>
    </>
  );
}
