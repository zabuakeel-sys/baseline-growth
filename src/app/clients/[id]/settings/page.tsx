import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { formatCents } from '@/lib/money';
import { inShareWindow, monthOf, shareCents, addMonths } from '@/lib/billing';
import { clientStatement, monthLabel, today } from '@/lib/work';
import { clientCustomers } from '@/lib/leads';
import { query } from '@/lib/db';
import { placesConfigured } from '@/lib/places';
import { getPlay } from '@/lib/plays';
import { updateClient } from '../../actions';
import { saveCustomerRevenue } from '../../../leads/actions';
import { saveRepTools } from '../../../tools/actions';
import { saveAutopilot } from '../../onboarding';
import ClientForm from '../../ClientForm';
import MailboxPanel from '../../MailboxPanel';
import ApprovePanel from '../../ApprovePanel';
import ActionForm from '../../../ActionForm';
import { setupSteps } from '@/lib/setup';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { paid: 'Paid', open: 'Due', late: 'Late', upcoming: 'This month' } as const;

/** Everything about a business you only touch to change it: strategy, email, automation, mailbox, deal. */
export default async function SettingsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client } = found;
  const { saved } = await searchParams;
  const now = today();
  const lastMonth = addMonths(monthOf(now), -1).slice(0, 7);
  const play = getPlay(client.play);
  const steps = await setupSteps(client);
  const { customers, revenue } = await clientCustomers(id);
  const money = isOwner ? await clientStatement(client) : [];
  const targets = (await query<{ id: number; what: string; location: string; last_run_at: string | null; last_found: number | null }>(
    `SELECT id, what, location, to_char(last_run_at AT TIME ZONE 'America/Detroit', 'Mon DD') AS last_run_at, last_found
     FROM targets WHERE client_id = $1 ORDER BY last_run_at NULLS FIRST, id`, [id])).rows;
  const whoTypes = [...new Set(targets.map((t) => t.what))];
  const wherePlaces = [...new Set(targets.map((t) => t.location))];

  return (
    <>
      <p><Link href={`/clients/${id}`}>Back to {client.name}</Link></p>
      <h1>{client.name} settings</h1>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <section className="card" aria-labelledby="strategy-h">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 id="strategy-h" style={{ margin: 0 }}>Strategy{play ? `: ${play.name}` : ''}</h2>
          {isOwner && <Link className="button secondary small" href={`/clients/${id}/setup`}>Edit answers</Link>}
        </div>
        {client.goal
          ? <p style={{ marginTop: 0 }}><strong>Goal:</strong> {client.goal}</p>
          : <p className="muted" style={{ marginTop: 0 }}>No goal set yet. {isOwner && <Link href={`/clients/${id}/setup`}>Add one</Link>}</p>}
        {client.offer && <p style={{ margin: '0 0 8px' }}><strong>Offer:</strong> {client.offer}</p>}
        {play && <p className="muted" style={{ margin: '0 0 8px', fontSize: 14 }}><strong>Rhythm:</strong> {play.rhythm}</p>}
        {whoTypes.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            <strong>Finding:</strong> {whoTypes.slice(0, 4).join(', ')}{whoTypes.length > 4 ? ` and ${whoTypes.length - 4} more` : ''} in {wherePlaces.length} place{wherePlaces.length === 1 ? '' : 's'}
          </p>
        )}
      </section>

      {isOwner && steps[0].done && steps[1].done && (
        <section className="card" aria-labelledby="approve-h">
          <h2 id="approve-h">First email</h2>
          <ApprovePanel client={client} back={`/clients/${id}/settings#approve-h`} />
        </section>
      )}

      <section className="card" aria-labelledby="autopilot-h">
        <h2 id="autopilot-h" style={{ marginTop: 0 }}>Automatic prospecting {client.autopilot ? <span className="pill signed">On</span> : <span className="pill">Off</span>}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {client.autopilot
            ? `Every day it finds businesses that match ${client.name}'s answers, adds up to ${client.daily_prospects} new prospects a day, and starts emailing them.`
            : 'Off: no new prospects are found or added for this business.'}
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

      {isOwner && <MailboxPanel clientId={id} clientName={client.name} />}

      <section className="card" aria-labelledby="tools-h">
        <h2 id="tools-h">Booking link and quote</h2>
        <ActionForm className="grid" action={saveRepTools.bind(null, id)}>
          <label className="full">Claim or booking link (the QR code on each prospect&apos;s page goes here)
            <input name="claim_url" defaultValue={client.claim_url} placeholder="https://www.example.com/claim-your-shop" />
          </label>
          <label>Button text<input name="claim_label" defaultValue={client.claim_label} placeholder="Claim your free listing" /></label>
          <label className="full">Instant quote prices, one building type per line: price per 1,000 sq ft per visit
            <textarea name="pricing_lines" rows={4} defaultValue={(client.pricing?.types ?? []).map((t) => `${t.name}: ${(t.ratePer1000Cents / 100).toFixed(2).replace(/\.00$/, '')}`).join('\n')} placeholder={'Office: 45\nMedical: 60'} />
          </label>
          <label>Minimum monthly price ($)<input name="pricing_minimum" inputMode="decimal" defaultValue={client.pricing?.minimumCents ? String(client.pricing.minimumCents / 100) : ''} /></label>
          <label>Range shown (+/- %)<input name="pricing_range" inputMode="decimal" defaultValue={client.pricing?.rangePercent ?? 10} /></label>
          <div className="actions full"><button type="submit">Save rep tools</button></div>
        </ActionForm>
      </section>

      <section className="card" aria-labelledby="customers-h">
        <h2 id="customers-h">Customers we brought</h2>
        {customers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>None yet. When a prospect buys from {client.name}, mark them &ldquo;Became a customer&rdquo; on their card.</p>
        ) : customers.map((c) => {
          const rows = revenue.filter((r) => r.lead_id === c.id);
          const start = monthOf(c.customer_since ?? now);
          const total = rows.reduce((s, r) => s + r.revenue_cents, 0);
          return (
            <article key={c.id} className="lead">
              <header className="lead-head">
                <div><strong>{c.name}</strong><div className="task-meta">Customer since {c.customer_since}</div></div>
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
                <ActionForm className="grid" action={saveCustomerRevenue.bind(null, c.id, `/clients/${id}/settings#customers-h`)}>
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
      </section>

      {isOwner && (
        <section className="card" aria-labelledby="money-h">
          <h2 id="money-h">What they owe us</h2>
          {money.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Not billed yet. Set the status to active, a start date and the deal terms below.</p>
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

      <section className="card" aria-labelledby="details-h">
        <h2 id="details-h">Details{isOwner ? ' and deal terms' : ''}</h2>
        <ClientForm action={updateClient.bind(null, id)} client={client} showTerms={isOwner} submitLabel="Save client" />
      </section>
    </>
  );
}
