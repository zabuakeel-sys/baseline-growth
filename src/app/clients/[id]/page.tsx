import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { listCheckups } from '@/lib/checkups';
import { AREAS, scoreCheckup } from '@/lib/checkup';
import { formatCents } from '@/lib/money';
import { addMonths, inShareWindow, monthOf, shareCents } from '@/lib/billing';
import { clientStatement, clientTasks, listUsers, monthLabel, today } from '@/lib/work';
import { clientCustomers, clientLeads } from '@/lib/leads';
import { leadStats } from '@/lib/followup';
import { updateClient } from '../actions';
import { addTask } from '../../work/actions';
import { addLead, saveCustomerRevenue } from '../../leads/actions';
import { saveScript } from '../../sales/actions';
import { saveRepTools } from '../../tools/actions';
import { saveAutopilot } from '../onboarding';
import { query } from '@/lib/db';
import { placesConfigured } from '@/lib/places';
import ClientForm from '../ClientForm';
import ActionForm from '../../ActionForm';
import TaskList from '../../work/TaskList';
import LeadCard from '../../leads/LeadCard';
import AddLeadForm from '../../leads/AddLeadForm';

export const dynamic = 'force-dynamic';

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
  const { client } = found;
  const [checkups, tasks, users, leads, { customers, revenue }] = await Promise.all([
    listCheckups(id), clientTasks(id), listUsers(), clientLeads(id), clientCustomers(id),
  ]);
  const money = isOwner ? await clientStatement(client) : [];
  const targets = (await query<{ id: number; what: string; location: string; last_run_at: string | null; last_found: number | null }>(
    `SELECT id, what, location, to_char(last_run_at AT TIME ZONE 'America/Detroit', 'Mon DD') AS last_run_at, last_found
     FROM targets WHERE client_id = $1 ORDER BY last_run_at NULLS FIRST, id`, [id])).rows;
  const addedToday = leads.filter((l) => l.source === 'Research' && l.received_on === today()).length;
  const { saved } = await searchParams;
  const now = today();
  const lastMonth = addMonths(monthOf(now), -1).slice(0, 7);
  const openTasks = tasks.filter((t) => !t.done_at);
  const doneTasks = tasks.filter((t) => t.done_at);
  const inPlay = leads.filter((l) => ['new', 'following_up', 'talking', 'introduced'].includes(l.status));
  const closedProspects = leads.filter((l) => l.status === 'lost' || l.status === 'opted_out');
  const stats = leadStats(leads);
  const back = `/clients/${id}#leads-h`;
  const terms = [
    client.share_percent > 0 && `${client.share_percent}% of what each customer we bring pays${client.share_months ? ` for ${client.share_months} months` : ', for as long as they stay'}`,
    client.signup_fee_cents > 0 && `${formatCents(client.signup_fee_cents)} per new customer`,
    client.monthly_fee_cents > 0 && `${formatCents(client.monthly_fee_cents)} a month`,
  ].filter(Boolean).join(' + ');

  return (
    <>
      <p><Link href="/">Back to clients</Link></p>
      <h1>{client.name}</h1>
      <p className="sub">
        {client.industry || 'No industry set'}
        {isOwner && terms && <> · {terms}</>}
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <section className="card" aria-labelledby="autopilot-h">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 id="autopilot-h" style={{ margin: 0 }}>Autopilot {client.autopilot ? <span className="pill signed">On</span> : <span className="pill">Off</span>}</h2>
          {isOwner && <Link className="button secondary small" href={`/clients/${id}/setup`}>Edit answers</Link>}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {client.autopilot
            ? `Every day it finds businesses that match ${client.name}'s answers, adds up to ${client.daily_prospects} new prospects, splits them among your reps, and starts outreach. Added today: ${addedToday}.`
            : 'Off: no new prospects are found or added for this business.'}
          {client.autopilot && !placesConfigured() && ' It cannot search until the Google Places key is added (see the checklist on the Clients page).'}
        </p>
        {isOwner && (
          <ActionForm className="inline-form" action={saveAutopilot.bind(null, id)}>
            <label className="check"><input type="checkbox" name="autopilot" defaultChecked={client.autopilot} style={{ minHeight: 0 }} /> On</label>
            <label className="check">New prospects a day <input name="daily_prospects" inputMode="numeric" defaultValue={client.daily_prospects} style={{ width: 70 }} /></label>
            <button type="submit" className="secondary small">Save</button>
          </ActionForm>
        )}
        {targets.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="muted">{targets.length} searches · {targets.filter((t) => t.last_run_at).length} run so far</summary>
            <ul className="plain-list" style={{ fontSize: 14 }}>
              {targets.map((t) => <li key={t.id}>{t.what} in {t.location} <span className="muted">· {t.last_run_at ? `run ${t.last_run_at}, ${t.last_found ?? 0} new` : 'waiting'}</span></li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="card" aria-labelledby="leads-h">
        <h2 id="leads-h">1. Prospects we are reaching</h2>
        {leads.length > 0 && (
          <div className="stats">
            <div className="stat"><div className="label">Prospects</div><div className="value">{stats.total}</div></div>
            <div className="stat"><div className="label">Reached</div><div className="value">{stats.reached}</div></div>
            <div className="stat"><div className="label">Introduced</div><div className="value">{stats.introduced}</div></div>
            <div className="stat"><div className="label">Became customers</div><div className="value">{stats.customers}{stats.customerRate !== null && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> ({stats.customerRate}% of reached)</span>}</div></div>
          </div>
        )}
        {inPlay.map((l) => <LeadCard key={l.id} lead={l} back={back} senderName={user.name} today={now} showClient={false} />)}
        {inPlay.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No prospects yet. Autopilot adds them and assigns them to reps.</p>}
        {closedProspects.length > 0 && (
          <details>
            <summary className="muted">{closedProspects.length} lost or do not contact</summary>
            {closedProspects.map((l) => <LeadCard key={l.id} lead={l} back={back} senderName={user.name} today={now} showClient={false} />)}
          </details>
        )}
        <details style={{ marginTop: 12 }}>
          <summary className="muted">Add one by hand</summary>
          <AddLeadForm action={addLead.bind(null, id, `/clients/${id}#leads-h`)} users={users} defaultAssignee={user.id} />
        </details>
      </section>

      <section className="card" aria-labelledby="customers-h">
        <h2 id="customers-h">2. Customers we brought</h2>
        {customers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>None yet. When a prospect buys from {client.name}, mark them &ldquo;Became a customer&rdquo;.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Each month, ask {client.name} what each customer paid them and enter it here. Only amounts the client confirmed are billed.
            </p>
            {customers.map((c) => {
              const rows = revenue.filter((r) => r.lead_id === c.id);
              const start = monthOf(c.customer_since ?? now);
              const total = rows.reduce((s, r) => s + r.revenue_cents, 0);
              const windowLeft = client.share_months ? client.share_months - (Number(now.slice(0, 4)) - Number(start.slice(0, 4))) * 12 - (Number(now.slice(5, 7)) - Number(start.slice(5, 7))) : null;
              return (
                <article key={c.id} className="lead">
                  <header className="lead-head">
                    <div>
                      <strong>{c.name}</strong>
                      <div className="task-meta">
                        Customer since {c.customer_since}
                        {client.share_percent > 0 && (windowLeft === null ? ' · share for as long as they stay'
                          : windowLeft > 0 ? ` · share for ${windowLeft} more month${windowLeft === 1 ? '' : 's'}` : ' · share period ended')}
                      </div>
                    </div>
                    <span className="pill signed">{formatCents(total)} reported</span>
                  </header>
                  {rows.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Month</th><th className="num">They paid {client.name}</th>{isOwner && <th className="num">Our share</th>}<th>Confirmed</th></tr></thead>
                        <tbody>
                          {[...rows].reverse().map((r) => (
                            <tr key={r.month}>
                              <td>{monthLabel(r.month)}</td>
                              <td className="num">{formatCents(r.revenue_cents)}</td>
                              {isOwner && <td className="num">{inShareWindow(start, monthOf(r.month), client.share_months) ? formatCents(shareCents(r.revenue_cents, client.share_percent)) : 'Outside share period'}</td>}
                              <td>{r.confirmed ? <span className="pill signed">{r.confirmed_by}</span> : <span className="pill missing">Not yet</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details>
                    <summary>Enter a month</summary>
                    <ActionForm className="grid" action={saveCustomerRevenue.bind(null, c.id, `/clients/${id}#customers-h`)}>
                      <label>Month<input name="month" type="month" defaultValue={lastMonth < start.slice(0, 7) ? start.slice(0, 7) : lastMonth} required /></label>
                      <label>What they paid ($)<input name="revenue" inputMode="decimal" required /></label>
                      <label className="check full"><input type="checkbox" name="confirmed" style={{ minHeight: 0 }} /> {client.name} confirmed this amount</label>
                      <label>Confirmed by (name at client)<input name="confirmed_by" /></label>
                      <div className="actions full"><button type="submit">Save</button></div>
                    </ActionForm>
                  </details>
                </article>
              );
            })}
          </>
        )}
      </section>

      <section className="card" aria-labelledby="tasks-h">
        <h2 id="tasks-h">3. Other work</h2>
        {openTasks.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>No open tasks.</p>
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
            <div className="actions full"><button type="submit">Add task</button></div>
          </ActionForm>
        </details>
      </section>

      {isOwner && (
        <section className="card" aria-labelledby="money-h">
          <h2 id="money-h">4. What they owe us</h2>
          {money.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Not billed yet. Set the status to active, a contract start date and the deal terms below.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="num">Share</th><th className="num">New customers</th><th className="num">Fee</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {[...money].reverse().map((r) => (
                    <tr key={r.month}>
                      <td>{monthLabel(r.month)}</td>
                      <td className="num">{formatCents(r.shareCents)}{r.waitingCents > 0 && <div className="task-meta">+{formatCents(r.waitingCents)} waiting</div>}</td>
                      <td className="num">{r.signups ? `${r.signups}${r.signupCents ? ` · ${formatCents(r.signupCents)}` : ''}` : '-'}</td>
                      <td className="num">{r.feeCents ? formatCents(r.feeCents) : '-'}</td>
                      <td className="num">{formatCents(r.paidCents)}</td>
                      <td className="num">{formatCents(Math.max(r.balanceCents, 0))}</td>
                      <td><span className={`pill ${r.status === 'paid' ? 'signed' : r.status === 'late' ? 'late' : r.status === 'open' ? 'missing' : ''}`}>{r.dueCents === 0 ? 'Nothing owed' : STATUS_LABEL[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginBottom: 0 }}><Link href="/money">Record a payment</Link></p>
        </section>
      )}

      <section className="card" aria-labelledby="checkups-h">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 id="checkups-h" style={{ margin: 0 }}>Revenue Checkups</h2>
          <Link className="button secondary" href={`/clients/${id}/checkup`}>Start checkup</Link>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Optional: use with a new client to see where their business is weakest before you agree terms.</p>
        {checkups.length > 0 && (
          <ul className="plain-list">
            {checkups.map((k) => {
              const { focus, overall } = scoreCheckup(k.answers);
              const names = focus.map((f) => AREAS.find((a) => a.key === f)!.name.toLowerCase());
              return (
                <li key={k.id}>
                  <Link href={`/checkups/${k.id}`}>{k.conducted_on}</Link>
                  {' · '}{names.length ? `Weakest: ${names.join(' and ')}` : 'No single weak area'}
                  <span className="muted"> · overall {overall}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="script-h">
        <h2 id="script-h">Sales script</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          What reps say on the phone and at the door for {client.name}. It shows on every prospect card.
        </p>
        <ActionForm action={saveScript.bind(null, id)}>
          <label>Script
            <textarea name="call_script" defaultValue={client.call_script} rows={10} placeholder={`Opening: Hi, this is [name] calling for ${client.name}. Do you have 30 seconds?\n\nQuestions:\n- Who handles ... today?\n- What would you change about it?\n\nIf they say "we're all set": ...\nIf they say "send me something": ...\n\nAsk for: a 15-minute walkthrough this week.`} />
          </label>
          <div className="actions" style={{ marginTop: 8 }}><button type="submit">Save script</button></div>
        </ActionForm>
      </section>

      <section className="card" aria-labelledby="tools-h">
        <h2 id="tools-h">Rep tools</h2>
        <ActionForm className="grid" action={saveRepTools.bind(null, id)}>
          <label className="full">Claim or booking link (the QR code on each prospect&apos;s personal page goes here)
            <input name="claim_url" defaultValue={client.claim_url} placeholder="https://www.example.com/claim-your-shop" />
          </label>
          <label>Button text<input name="claim_label" defaultValue={client.claim_label} placeholder="Claim your free listing" /></label>
          <p className="muted full" style={{ margin: 0, fontSize: 13 }}>
            Each prospect&apos;s link gets <code>?ref=bg-NUMBER</code> added, so {client.name} can see which signups came from us.
          </p>
          <label className="full">Instant quote prices, one building type per line: price for one visit per 1,000 sq ft
            <textarea name="pricing_lines" rows={4} defaultValue={(client.pricing?.types ?? []).map((t) => `${t.name}: ${(t.ratePer1000Cents / 100).toFixed(2).replace(/\.00$/, '')}`).join('\n')} placeholder={'Office: 45\nMedical: 60\nRetail: 40'} />
          </label>
          <label>Minimum monthly price ($)<input name="pricing_minimum" inputMode="decimal" defaultValue={client.pricing?.minimumCents ? String(client.pricing.minimumCents / 100) : ''} /></label>
          <label>Range shown (+/- %)<input name="pricing_range" inputMode="decimal" defaultValue={client.pricing?.rangePercent ?? 10} /></label>
          <p className="muted full" style={{ margin: 0, fontSize: 13 }}>Leave prices empty if this client has no instant quote. Get the numbers from the client; reps quote them as estimates.</p>
          <div className="actions full"><button type="submit">Save rep tools</button></div>
        </ActionForm>
      </section>

      <section className="card" aria-labelledby="details-h">
        <h2 id="details-h">Details{isOwner ? ' and deal terms' : ''}</h2>
        <ClientForm action={updateClient.bind(null, id)} client={client} showTerms={isOwner} submitLabel="Save client" />
      </section>
    </>
  );
}
