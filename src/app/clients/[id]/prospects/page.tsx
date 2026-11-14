import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { clientLeads } from '@/lib/leads';
import { leadStats } from '@/lib/followup';
import { clientTasks, listUsers, today } from '@/lib/work';
import { addTask } from '../../../work/actions';
import { addLead } from '../../../leads/actions';
import ActionForm from '../../../ActionForm';
import TaskList from '../../../work/TaskList';
import LeadCard from '../../../leads/LeadCard';
import AddLeadForm from '../../../leads/AddLeadForm';

export const dynamic = 'force-dynamic';

/** The full list of a business's prospects, where a lead is moved through its stages. The main page
 * shows only who needs action today; this is for digging into everyone. */
export default async function ProspectsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client } = found;
  const { saved } = await searchParams;
  const now = today();
  const [leads, tasks, users] = await Promise.all([clientLeads(id), clientTasks(id), listUsers()]);
  const inPlay = leads.filter((l) => ['new', 'following_up', 'talking', 'introduced'].includes(l.status));
  const closed = leads.filter((l) => l.status === 'lost' || l.status === 'opted_out');
  const openTasks = tasks.filter((t) => !t.done_at);
  const stats = leadStats(leads);
  const back = `/clients/${id}/prospects`;

  return (
    <>
      <div className="biz-top">
        <p style={{ margin: 0 }}><Link href={`/clients/${id}`}>Back to {client.name}</Link></p>
        <Link className="button small" href={`/next?client=${id}`}>Work one at a time</Link>
      </div>
      <h1 style={{ marginBottom: 4 }}>{client.name} prospects</h1>
      {saved && <p className="notice" role="status">{saved}.</p>}

      {leads.length > 0 && (
        <div className="stats">
          <div className="stat"><div className="label">Prospects</div><div className="value">{stats.total}</div></div>
          <div className="stat"><div className="label">Reached</div><div className="value">{stats.reached}</div></div>
          <div className="stat"><div className="label">Introduced</div><div className="value">{stats.introduced}</div></div>
          <div className="stat"><div className="label">Customers</div><div className="value">{stats.customers}</div></div>
        </div>
      )}

      <section className="card" aria-labelledby="leads-h">
        <h2 id="leads-h" style={{ marginTop: 0 }}>Being reached ({inPlay.length})</h2>
        {inPlay.map((l) => <LeadCard key={l.id} lead={l} back={back} senderName={user.name} today={now} showClient={false} />)}
        {inPlay.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No prospects yet. They are found and added on their own.</p>}
        {closed.length > 0 && (
          <details>
            <summary className="muted">{closed.length} lost or do not contact</summary>
            {closed.map((l) => <LeadCard key={l.id} lead={l} back={back} senderName={user.name} today={now} showClient={false} />)}
          </details>
        )}
        <details style={{ marginTop: 12 }}>
          <summary className="muted">Add one by hand</summary>
          <AddLeadForm action={addLead.bind(null, id, back)} users={users} defaultAssignee={user.id} />
        </details>
      </section>

      <section className="card" aria-labelledby="tasks-h">
        <h2 id="tasks-h" style={{ marginTop: 0 }}>Tasks</h2>
        {openTasks.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>No open tasks.</p>
          : <TaskList tasks={openTasks} back={back} showClient={false} today={now} />}
        <details style={{ marginTop: 12 }}>
          <summary>Add a task</summary>
          <ActionForm className="grid" action={addTask.bind(null, id)}>
            <label className="full">What needs doing<input name="title" required /></label>
            <label>Due<input name="due_on" type="date" /></label>
            <label>Who<select name="assignee_id" defaultValue={user.id}>
              <option value="">Nobody yet</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></label>
            <div className="actions full"><button type="submit">Add task</button></div>
          </ActionForm>
        </details>
      </section>
    </>
  );
}
