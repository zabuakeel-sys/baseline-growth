import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { listUsers } from '@/lib/work';
import { addPartner, togglePartner } from '../tools/actions';
import ActionForm from '../ActionForm';
import CopyButton from '../leads/CopyButton';

export const dynamic = 'force-dynamic';

type Partner = {
  id: number; name: string; kind: string; contact_name: string; email: string; phone: string; code: string; fee_cents: number;
  active: boolean; client_name: string | null; assignee_name: string | null; referred: number; customers: number;
};

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const [partners, clients, users] = await Promise.all([
    query<Partner>(`SELECT p.*, c.name AS client_name, u.name AS assignee_name,
        (SELECT count(*)::int FROM leads l WHERE l.partner_id = p.id) AS referred,
        (SELECT count(*)::int FROM leads l WHERE l.partner_id = p.id AND l.status = 'won') AS customers
      FROM partners p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.assignee_id
      ORDER BY p.active DESC, customers DESC, p.name`).then((r) => r.rows),
    query<{ id: number; name: string }>("SELECT id, name FROM clients WHERE status <> 'ended' ORDER BY name").then((r) => r.rows),
    listUsers(),
  ]);

  return (
    <>
      <h1>Referral partners</h1>
      <p className="sub">
        Businesses that already serve your clients&apos; customers and can send them your way. Each gets its own link to send us a
        business in a minute; every referral lands on its rep&apos;s Today list with a same-day callback.
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}
      <section className="card table-wrap">
        {partners.length === 0 ? <p className="muted" style={{ margin: 0 }}>No partners yet. Good first ones: tow companies and parts suppliers for AutoAt; property managers and building vendors for LibraPro.</p> : (
          <table>
            <thead><tr><th>Partner</th><th>For</th><th className="num">Referred</th><th className="num">Became customers</th><th className="num">Fees owed</th><th>Their link</th><th /></tr></thead>
            <tbody>
              {partners.map((p) => {
                const link = `${origin}/r/${p.code}`;
                return (
                  <tr key={p.id} className={p.active ? '' : 'muted'}>
                    <td><strong>{p.name}</strong><div className="task-meta">{[p.kind, p.contact_name, p.phone, p.email].filter(Boolean).join(' · ')}</div></td>
                    <td>{p.client_name ?? '-'}<div className="task-meta">{p.assignee_name ? `rep: ${p.assignee_name}` : 'no rep'}</div></td>
                    <td className="num">{p.referred}</td>
                    <td className="num">{p.customers}</td>
                    <td className="num">{formatCents(p.customers * p.fee_cents)}<div className="task-meta">{formatCents(p.fee_cents)} each</div></td>
                    <td>{p.active ? <><code style={{ wordBreak: 'break-all' }}>{link}</code><div style={{ marginTop: 4 }}><CopyButton text={link} /></div></> : 'Paused'}</td>
                    <td><form action={togglePartner.bind(null, p.id)}><button type="submit" className="secondary small">{p.active ? 'Pause' : 'Resume'}</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>Add a partner</h2>
        <ActionForm className="grid" action={addPartner}>
          <label>Partner business<input name="name" required /></label>
          <label>Type<input name="kind" placeholder="Tow company, property manager" /></label>
          <label>Sends prospects for
            <select name="client_id" required defaultValue="">
              <option value="" disabled>Pick a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Rep who follows up
            <select name="assignee_id" defaultValue={user.id}>
              <option value="">Nobody yet</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>Contact name<input name="contact_name" /></label>
          <label>Phone<input name="phone" type="tel" /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Fee per customer won ($)<input name="fee" inputMode="decimal" placeholder="100" /></label>
          <label className="full">Notes<input name="notes" /></label>
          <div className="actions full"><button type="submit">Add partner</button></div>
        </ActionForm>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Put the partner fee in a short written agreement. Paying referral fees is normal in most industries, but some
          licensed professions restrict it; check with the lawyer before offering fees to, say, real estate agents.
        </p>
      </section>
    </>
  );
}
