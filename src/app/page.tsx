import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  await requireUser();
  const clients = await listClients();
  const active = clients.filter((c) => c.status === 'active');
  const sum = (k: 'prospects' | 'introduced' | 'customers') => clients.reduce((s, c) => s + c[k], 0);

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Clients</h1>
          <p className="sub" style={{ margin: 0 }}>We find new customers for each client and share in what those customers pay.</p>
        </div>
        <Link className="button" href="/clients/new">Add client</Link>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Active clients</div><div className="value">{active.length}</div></div>
        <div className="stat"><div className="label">Prospects in play</div><div className="value">{sum('prospects')}</div></div>
        <div className="stat"><div className="label">With clients now</div><div className="value">{sum('introduced')}</div></div>
        <div className="stat"><div className="label">Customers we brought</div><div className="value">{sum('customers')}</div></div>
      </div>

      <div className="card table-wrap">
        {clients.length === 0 ? (
          <p className="muted">No clients yet. Add your first one.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Client</th><th>Status</th><th className="num">Prospects</th><th className="num">Introduced</th><th className="num">Customers</th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`}>{c.name}</Link><div className="muted" style={{ fontSize: 13 }}>{c.industry}</div></td>
                  <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                  <td className="num">{c.prospects}</td>
                  <td className="num">{c.introduced}</td>
                  <td className="num">{c.customers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
