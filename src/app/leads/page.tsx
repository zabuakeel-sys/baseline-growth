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
  if (!Number.isInteger(clientId) || clientId <= 0) return { error: 'Pick which client the inquiry is for.' };
  return addLead(clientId, '/leads', formData);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
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
  const waiting = leads.filter((l) => !due.includes(l) && !decide.includes(l) && !talking.includes(l));

  return (
    <>
      <h1>Follow-ups</h1>
      <p className="sub">
        Every inquiry gets a reply the day it comes in, then a follow-up 1, 3, 7 and 14 days later until it is won or lost.
        Send the message, then tap &ldquo;I sent it&rdquo;.
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <div className="stats">
        <div className="stat"><div className="label">Due now</div><div className={`value${due.length ? ' late' : ''}`}>{due.length}</div></div>
        <div className="stat"><div className="label">Talking</div><div className="value">{talking.length}</div></div>
        <div className="stat"><div className="label">Waiting for next follow-up</div><div className="value">{waiting.length}</div></div>
      </div>

      <details className="card" open={leads.length === 0}>
        <summary><strong>Log a new inquiry</strong></summary>
        <AddLeadForm action={addLeadAnyClient} users={users} defaultAssignee={user.id} today={now} clients={clients} />
      </details>

      <section className="card" aria-labelledby="due-h">
        <h2 id="due-h">Due now</h2>
        {due.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nobody is waiting on a reply.</p>
          : due.map((l) => <LeadCard key={l.id} lead={l} back="/leads" senderName={user.name} today={now} showClient />)}
      </section>
      {decide.length > 0 && (
        <section className="card" aria-labelledby="decide-h">
          <h2 id="decide-h">No reply after every follow-up</h2>
          {decide.map((l) => <LeadCard key={l.id} lead={l} back="/leads" senderName={user.name} today={now} showClient />)}
        </section>
      )}
      {talking.length > 0 && (
        <section className="card" aria-labelledby="talking-h">
          <h2 id="talking-h">Talking</h2>
          {talking.map((l) => <LeadCard key={l.id} lead={l} back="/leads" senderName={user.name} today={now} showClient />)}
        </section>
      )}
      {waiting.length > 0 && (
        <details className="card">
          <summary><strong>Waiting for next follow-up ({waiting.length})</strong></summary>
          {waiting.map((l) => <LeadCard key={l.id} lead={l} back="/leads" senderName={user.name} today={now} showClient />)}
        </details>
      )}
    </>
  );
}
