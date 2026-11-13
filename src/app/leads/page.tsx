import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { openLeads } from '@/lib/leads';
import { isDue, needsDecision } from '@/lib/followup';
import { listUsers, today } from '@/lib/work';
import { addLead } from './actions';
import LeadCard from './LeadCard';
import AddLeadForm from './AddLeadForm';

export const dynamic = 'force-dynamic';

/** The page form picks the client, so it posts through this wrapper. */
async function addLeadAnyClient(formData: FormData): Promise<{ error?: string }> {
  'use server';
  const clientId = Number(formData.get('client_id'));
  if (!Number.isInteger(clientId) || clientId <= 0) return { error: 'Pick which client this prospect is for.' };
  return addLead(clientId, '/leads', formData);
}

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const now = today();
  const [leads, users, clients] = await Promise.all([
    openLeads(), listUsers(),
    query<{ id: number; name: string }>("SELECT id, name FROM clients WHERE status <> 'ended' ORDER BY name").then((r) => r.rows),
  ]);
  const due = leads.filter((l) => isDue(l, now));
  const decide = leads.filter((l) => needsDecision(l));
  const talking = leads.filter((l) => l.status === 'talking');
  const introduced = leads.filter((l) => l.status === 'introduced');
  const waiting = leads.filter((l) => (l.status === 'new' || l.status === 'following_up') && !due.includes(l) && !decide.includes(l));
  const card = (l: (typeof leads)[number]) => <LeadCard key={l.id} lead={l} back="/leads" senderName={user.name} today={now} showClient />;

  return (
    <>
      <h1>Prospects</h1>
      <p className="sub">
        People and businesses we reach on a client&apos;s behalf. Each gets a first message, then follow-ups 3, 7 and 14 days
        later until they reply. Introduce the interested ones to the client; when they buy, record them as a customer.
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <div className="stats">
        <div className="stat"><div className="label">Messages due</div><div className={`value${due.length ? ' late' : ''}`}>{due.length}</div></div>
        <div className="stat"><div className="label">Talking</div><div className="value">{talking.length}</div></div>
        <div className="stat"><div className="label">With the client</div><div className="value">{introduced.length}</div></div>
      </div>

      <details className="card" open={leads.length === 0}>
        <summary><strong>Add a prospect</strong></summary>
        <AddLeadForm action={addLeadAnyClient} users={users} defaultAssignee={user.id} clients={clients} />
      </details>

      <section className="card" aria-labelledby="due-h">
        <h2 id="due-h">Messages due</h2>
        {due.length === 0 ? <p className="muted" style={{ margin: 0 }}>No messages due today.</p> : due.map(card)}
      </section>
      {talking.length > 0 && <section className="card" aria-labelledby="talking-h"><h2 id="talking-h">Talking</h2>{talking.map(card)}</section>}
      {introduced.length > 0 && (
        <section className="card" aria-labelledby="intro-h">
          <h2 id="intro-h">Introduced, waiting on the client</h2>
          <p className="muted" style={{ marginTop: 0 }}>Ask the client how each one went. When one buys, record them as a customer.</p>
          {introduced.map(card)}
        </section>
      )}
      {decide.length > 0 && <section className="card" aria-labelledby="decide-h"><h2 id="decide-h">No reply after every message</h2>{decide.map(card)}</section>}
      {waiting.length > 0 && (
        <details className="card">
          <summary><strong>Waiting for the next message ({waiting.length})</strong></summary>
          {waiting.map(card)}
        </details>
      )}
    </>
  );
}
