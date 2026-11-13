import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const clients = await listClients();
  const active = clients.filter((c) => c.status === 'active');
  const monthlyFees = active.reduce((sum, c) => sum + c.monthly_fee_cents, 0);
  const signed = clients.filter((c) => c.baseline_signed).length;

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Clients</h1>
          <p className="sub" style={{ margin: 0 }}>Every client starts with a signed baseline. Growth is measured against it.</p>
        </div>
        <Link className="button" href="/clients/new">Add client</Link>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Active clients</div><div className="value">{active.length}</div></div>
        <div className="stat"><div className="label">Baselines signed</div><div className="value">{signed} of {clients.length}</div></div>
        {isOwner && <div className="stat"><div className="label">Monthly fees (active)</div><div className="value">{formatCents(monthlyFees)}</div></div>}
      </div>

      <div className="card table-wrap">
        {clients.length === 0 ? (
          <p className="muted">No clients yet. Add your first one.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th><th>Status</th><th>Baseline</th>
                <th className="num">Baseline revenue / mo</th>
                {isOwner && <th className="num">Fee / mo</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`}>{c.name}</Link><div className="muted" style={{ fontSize: 13 }}>{c.industry}</div></td>
                  <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                  <td>{c.baseline_signed ? <span className="pill signed">Signed</span> : <span className="pill missing">Needed</span>}</td>
                  <td className="num">{formatCents(c.baseline_revenue_cents)}</td>
                  {isOwner && <td className="num">{c.monthly_fee_cents ? formatCents(c.monthly_fee_cents) : 'Not set'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
