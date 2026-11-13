import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { listCheckups } from '@/lib/checkups';
import { AREAS, scoreCheckup } from '@/lib/checkup';
import { formatCents } from '@/lib/money';
import { monthOf, addMonths } from '@/lib/billing';
import { clientResults, clientStatement, clientTasks, listUsers, monthLabel, today } from '@/lib/work';
import { saveBaseline, updateClient } from '../actions';
import { addTask, saveResult } from '../../work/actions';
import ClientForm from '../ClientForm';
import ActionForm from '../../ActionForm';
import TaskList from '../../work/TaskList';

export const dynamic = 'force-dynamic';

const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100));
const plain = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
const signedCents = (c: number) => (c >= 0 ? `+${formatCents(c)}` : `-${formatCents(-c)}`);
const STATUS_LABEL = { paid: 'Paid', open: 'Due', late: 'Late', upcoming: 'This month' } as const;

export default async function ClientPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client, baseline } = found;
  const [checkups, tasks, results, users] = await Promise.all([listCheckups(id), clientTasks(id), clientResults(id), listUsers()]);
  const money = isOwner ? await clientStatement(client, baseline) : [];
  const { saved } = await searchParams;
  const locked = Boolean(baseline?.signed_off) && !isOwner;
  const now = today();
  const openTasks = tasks.filter((t) => !t.done_at);
  const doneTasks = tasks.filter((t) => t.done_at);
  const baseRevenue = baseline?.monthly_revenue_cents ?? null;
  const lastMonth = addMonths(monthOf(now), -1).slice(0, 7);

  return (
    <>
      <p><Link href="/">Back to clients</Link></p>
      <h1>{client.name}</h1>
      <p className="sub">
        {client.industry || 'No industry set'}
        {isOwner && client.monthly_fee_cents > 0 && <> · {formatCents(client.monthly_fee_cents)}/mo + {client.bonus_percent}% of growth</>}
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <section className="card" aria-labelledby="checkups-h">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 id="checkups-h" style={{ margin: 0 }}>1. Revenue Checkups</h2>
          <Link className="button" href={`/clients/${id}/checkup`}>Start checkup</Link>
        </div>
        {checkups.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>No checkup yet. Run one with the owner to find where revenue is stuck.</p>
        ) : (
          <ul className="plain-list">
            {checkups.map((k) => {
              const { focus, overall } = scoreCheckup(k.answers);
              const names = focus.map((f) => AREAS.find((a) => a.key === f)!.name.toLowerCase());
              return (
                <li key={k.id}>
                  <Link href={`/checkups/${k.id}`}>{k.conducted_on}</Link>
                  {' · '}{names.length ? `Stuck at ${names.join(' and ')}` : 'No single bottleneck'}
                  <span className="muted"> · overall {overall}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="baseline-h">
        <h2 id="baseline-h">2. Baseline</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          The client&apos;s numbers before we start. Growth, and our bonus, is measured against monthly revenue here, so get
          it confirmed by the client.
        </p>
        {locked ? (
          <p>Confirmed by {baseline?.signed_off_by}: {formatCents(baseline?.monthly_revenue_cents)} a month. Only the owner can change a confirmed baseline.</p>
        ) : (
          <ActionForm className="grid" action={saveBaseline.bind(null, id)}>
            <label>Monthly revenue ($)<input name="monthly_revenue" inputMode="decimal" defaultValue={dollars(baseline?.monthly_revenue_cents)} placeholder="50000" /></label>
            <label>Inquiries per month<input name="monthly_inquiries" inputMode="numeric" defaultValue={plain(baseline?.monthly_inquiries)} /></label>
            <label>Close rate (%)<input name="close_rate_percent" inputMode="decimal" defaultValue={plain(baseline?.close_rate_percent)} /></label>
            <label>Average sale ($)<input name="avg_sale" inputMode="decimal" defaultValue={dollars(baseline?.avg_sale_cents)} /></label>
            <label>Repeat rate (%)<input name="repeat_rate_percent" inputMode="decimal" defaultValue={plain(baseline?.repeat_rate_percent)} /></label>
            <label>Measured on<input name="measured_on" type="date" defaultValue={baseline?.measured_on ?? ''} /></label>
            <label className="check full"><input type="checkbox" name="signed_off" defaultChecked={baseline?.signed_off} style={{ minHeight: 0 }} /> Client has confirmed these numbers</label>
            <label>Confirmed by (name at client)<input name="signed_off_by" defaultValue={baseline?.signed_off_by} /></label>
            <div className="actions full"><button type="submit">Save baseline</button></div>
          </ActionForm>
        )}
      </section>

      <section className="card" aria-labelledby="tasks-h">
        <h2 id="tasks-h">3. The work</h2>
        {openTasks.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>No open tasks. Open a checkup and add its plan, or add a task below.</p>
        ) : (
          <TaskList tasks={openTasks} back={`/clients/${id}#tasks-h`} showClient={false} today={now} />
        )}
        {doneTasks.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="muted">{doneTasks.length} done</summary>
            <TaskList tasks={doneTasks} back={`/clients/${id}#tasks-h`} showClient={false} today={now} />
          </details>
        )}
        <details style={{ marginTop: 12 }}>
          <summary>Add a task</summary>
          <ActionForm className="grid" action={addTask.bind(null, id)}>
            <label className="full">What needs doing<input name="title" required /></label>
            <label>Due<input name="due_on" type="date" /></label>
            <label>Who
              <select name="assignee_id" defaultValue={user.id}>
                <option value="">Nobody yet</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label>Area
              <select name="area" defaultValue="">
                <option value="">None</option>
                {AREAS.map((a) => <option key={a.key} value={a.name}>{a.name}</option>)}
              </select>
            </label>
            <div className="actions full"><button type="submit">Add task</button></div>
          </ActionForm>
        </details>
      </section>

      <section className="card" aria-labelledby="results-h">
        <h2 id="results-h">4. Monthly results</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Each month, enter the client&apos;s numbers. Growth is that month&apos;s revenue minus the baseline
          {baseRevenue !== null ? ` (${formatCents(baseRevenue)})` : ''}.
        </p>
        {results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num">Growth</th><th className="num">Inquiries</th><th className="num">New customers</th><th>Confirmed</th></tr></thead>
              <tbody>
                {results.map((r) => {
                  const growth = baseRevenue !== null ? r.revenue_cents - baseRevenue : null;
                  return (
                    <tr key={r.month}>
                      <td>{monthLabel(r.month)}</td>
                      <td className="num">{formatCents(r.revenue_cents)}</td>
                      <td className={`num ${growth !== null && growth > 0 ? 'up' : ''}`}>
                        {growth === null ? 'No baseline' : baseRevenue ? `${signedCents(growth)} (${Math.round((growth / baseRevenue) * 100)}%)` : signedCents(growth)}
                      </td>
                      <td className="num">{r.inquiries ?? '-'}</td>
                      <td className="num">{r.new_customers ?? '-'}</td>
                      <td>{r.confirmed ? <span className="pill signed">{r.confirmed_by}</span> : <span className="pill missing">Not yet</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <details style={{ marginTop: 12 }} open={results.length === 0}>
          <summary>Enter a month</summary>
          <ActionForm className="grid" action={saveResult.bind(null, id)}>
            <label>Month<input name="month" type="month" defaultValue={lastMonth} required /></label>
            <label>Revenue ($)<input name="revenue" inputMode="decimal" required /></label>
            <label>Inquiries<input name="inquiries" inputMode="numeric" /></label>
            <label>New customers<input name="new_customers" inputMode="numeric" /></label>
            <label className="full">Notes<input name="notes" placeholder="What changed this month" /></label>
            <label className="check full"><input type="checkbox" name="confirmed" style={{ minHeight: 0 }} /> Client has confirmed these numbers</label>
            <label>Confirmed by (name at client)<input name="confirmed_by" /></label>
            <div className="actions full"><button type="submit">Save month</button></div>
          </ActionForm>
          <p className="muted" style={{ fontSize: 13 }}>Entering a month that already exists replaces it.</p>
        </details>
      </section>

      {isOwner && (
        <section className="card" aria-labelledby="money-h">
          <h2 id="money-h">5. What they owe us</h2>
          {money.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Not billed yet. Set the status to active, a contract start date and a fee below.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="num">Fee</th><th className="num">Bonus</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {[...money].reverse().map((r) => (
                    <tr key={r.month}>
                      <td>{monthLabel(r.month)}</td>
                      <td className="num">{formatCents(r.feeCents)}</td>
                      <td className="num">{r.bonusCents ? formatCents(r.bonusCents) : r.bonusPending ? 'Waiting' : '$0'}</td>
                      <td className="num">{formatCents(r.paidCents)}</td>
                      <td className="num">{formatCents(Math.max(r.balanceCents, 0))}</td>
                      <td><span className={`pill ${r.status === 'paid' ? 'signed' : r.status === 'late' ? 'late' : r.status === 'open' ? 'missing' : ''}`}>{STATUS_LABEL[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginBottom: 0 }}><Link href="/money">Record a payment</Link></p>
        </section>
      )}

      <section className="card" aria-labelledby="details-h">
        <h2 id="details-h">Details{isOwner ? ' and deal terms' : ''}</h2>
        <ClientForm action={updateClient.bind(null, id)} client={client} showTerms={isOwner} submitLabel="Save client" />
      </section>
    </>
  );
}
