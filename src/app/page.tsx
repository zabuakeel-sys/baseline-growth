import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { query } from '@/lib/db';
import { placesConfigured } from '@/lib/places';
import { mailStatus } from '@/lib/mail';
import { coachConfigured } from '@/lib/coach';
import { missingAnswers } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await listClients();
  const isOwner = user.role === 'owner';
  const reps = Number((await query<{ n: string }>("SELECT count(*) AS n FROM users WHERE role = 'team'")).rows[0].n);
  const waiting = Number((await query<{ n: string }>("SELECT count(*) AS n FROM outbox WHERE status = 'pending'")).rows[0].n);
  const mail = mailStatus();
  const checks: { done: boolean; label: string; how: React.ReactNode; optional?: boolean }[] = [
    { done: clients.length > 0, label: 'Add your first business', how: <Link href="/clients/new">Ask the owner the questions and enter their answers</Link> },
    { done: placesConfigured(), label: 'Connect business search', how: <>Google Places API key in Railway as <code>GOOGLE_PLACES_API_KEY</code>, with a budget alert</> },
    { done: mail.send && mail.read, label: 'Connect the outreach mailbox', how: <>A separate outreach domain and mailbox; settings in Railway (see the <Link href="/outbox">Outbox</Link> page)</> },
    { done: reps > 0, label: 'Add a sales rep', how: <><Link href="/team">Team page</Link>: add them, set commission and daily goals. Until then, prospects go to you.</> },
    { done: coachConfigured(), label: 'Connect the AI call coach', how: <>Anthropic API key in Railway as <code>ANTHROPIC_API_KEY</code>. Without it, the coach uses each business&apos;s script.</>, optional: true },
  ];
  for (const c of clients.filter((x) => x.status !== 'ended')) {
    const a = (c.onboarding ?? {}) as Record<string, unknown>;
    const missing = c.onboarding ? missingAnswers((k) => a[k]) : ['all answers'];
    if (missing.length) checks.push({ done: false, label: `${c.name}: finish the answers`, how: <Link href={`/clients/${c.id}/setup`}>{missing.length} still needed</Link> });
    if (!c.contract_start) checks.push({ done: false, label: `${c.name}: add the agreement start date`, how: <Link href={`/clients/${c.id}/setup`}>Needed to bill them</Link> });
  }
  const todo = checks.filter((c) => !c.done && !c.optional);
  const active = clients.filter((c) => c.status === 'active');
  const sum = (k: 'prospects' | 'introduced' | 'customers') => clients.reduce((s, c) => s + c[k], 0);

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Clients</h1>
          <p className="sub" style={{ margin: 0 }}>We find new customers for each client and share in what those customers pay.</p>
        </div>
        {isOwner && <Link className="button" href="/clients/new">Add a business</Link>}
      </div>

      {isOwner && (todo.length > 0 || waiting > 0) && (
        <section className="card checklist" aria-labelledby="check-h">
          <h2 id="check-h">{todo.length ? `To get the system running (${todo.length} left)` : 'Running'}</h2>
          <ul>
            {checks.map((c) => (
              <li key={c.label} className={c.done ? 'done' : ''}>
                <span className="tickmark" aria-hidden="true">{c.done ? '✓' : ''}</span>
                <span><strong>{c.label}</strong>{c.optional && <span className="muted"> (optional)</span>}{!c.done && <span className="task-meta" style={{ display: 'block' }}>{c.how}</span>}</span>
              </li>
            ))}
          </ul>
          {waiting > 0 && <p style={{ marginBottom: 0 }}><Link href="/outbox">{waiting} email{waiting === 1 ? '' : 's'} waiting for your approval</Link></p>}
        </section>
      )}

      <div className="stats">
        <div className="stat"><div className="label">Active clients</div><div className="value">{active.length}</div></div>
        <div className="stat"><div className="label">Prospects in play</div><div className="value">{sum('prospects')}</div></div>
        <div className="stat"><div className="label">With clients now</div><div className="value">{sum('introduced')}</div></div>
        <div className="stat"><div className="label">Customers we brought</div><div className="value">{sum('customers')}</div></div>
      </div>

      <div className="card table-wrap">
        {clients.length === 0 ? (
          <p className="muted">No businesses yet. {isOwner ? <Link href="/clients/new">Add your first one</Link> : 'The owner adds them.'}</p>
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
