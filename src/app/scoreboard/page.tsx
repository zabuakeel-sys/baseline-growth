import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { commissions, scoreboard } from '@/lib/sales';
import { inShareWindow, monthOf, shareCents } from '@/lib/billing';
import { formatCents } from '@/lib/money';
import { today } from '@/lib/work';

export const dynamic = 'force-dynamic';

const PERIODS = { week: 'Last 7 days', month: 'This month', all: 'All time' } as const;
type Period = keyof typeof PERIODS;

export default async function ScoreboardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const p = ((await searchParams).p ?? 'week') as Period;
  const period: Period = p in PERIODS ? p : 'week';
  const now = today();
  const since = period === 'week'
    ? new Date(Date.parse(`${now}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10)
    : period === 'month' ? `${now.slice(0, 7)}-01` : '1970-01-01';
  const local = (col: string) => `(${col} AT TIME ZONE 'America/Detroit')::date >= $1::date`;

  const [users, activities, meetings, customers, revenue, clients] = await Promise.all([
    query<{ id: number; name: string; commission_percent: number }>('SELECT id, name, commission_percent FROM users ORDER BY name').then((r) => r.rows),
    query<{ user_id: number | null; channel: string; outcome: string }>(`SELECT user_id, channel, outcome FROM activities WHERE ${local('created_at')}`, [since]).then((r) => r.rows),
    query<{ booked_by: number | null; status: string }>(`SELECT booked_by, status FROM meetings WHERE ${local('created_at')}`, [since]).then((r) => r.rows),
    query<{ id: number; won_by: number | null; customer_since: string | null; client_id: number }>(
      "SELECT id, won_by, customer_since, client_id FROM leads WHERE status = 'won'").then((r) => r.rows),
    query<{ lead_id: number; month: string; revenue_cents: number; confirmed: boolean }>(
      "SELECT r.lead_id, r.month, r.revenue_cents, r.confirmed FROM customer_revenue r JOIN leads l ON l.id = r.lead_id WHERE l.status = 'won'").then((r) => r.rows),
    query<{ id: number; share_percent: number; share_months: number | null; signup_fee_cents: number }>(
      'SELECT id, share_percent, share_months, signup_fee_cents FROM clients').then((r) => r.rows),
  ]);
  const inPeriod = customers.filter((c) => c.customer_since && c.customer_since >= since);
  const rows = scoreboard({ users, activities, meetings, customers: inPeriod });
  const pay = commissions({
    customers, revenue, clients: Object.fromEntries(clients.map((c) => [c.id, c])),
    rates: Object.fromEntries(users.map((u) => [u.id, u.commission_percent])),
    inWindow: inShareWindow, shareFor: shareCents, monthOf,
  });
  const payFor = (id: number) => pay.find((x) => x.userId === id);
  const total = rows.reduce((t, r) => ({
    calls: t.calls + r.calls, visits: t.visits + r.visits, conversations: t.conversations + r.conversations,
    meetingsBooked: t.meetingsBooked + r.meetingsBooked, meetingsHeld: t.meetingsHeld + r.meetingsHeld, customers: t.customers + r.customers,
  }), { calls: 0, visits: 0, conversations: 0, meetingsBooked: 0, meetingsHeld: 0, customers: 0 });

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Scoreboard</h1>
          <p className="sub" style={{ margin: 0 }}>Activity drives meetings; meetings held drive customers. Watch the meetings held column.</p>
        </div>
        <div className="segmented" role="group" aria-label="Period">
          {(Object.keys(PERIODS) as Period[]).map((k) => (
            <Link key={k} href={`/scoreboard?p=${k}`} aria-current={k === period ? 'true' : undefined}>{PERIODS[k]}</Link>
          ))}
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rep</th><th className="num">Calls</th><th className="num">Visits</th><th className="num">Conversations</th>
              <th className="num">Meetings booked</th><th className="num">Meetings held</th><th className="num">Customers won</th>
              <th className="num">Commission earned to date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = payFor(r.userId);
              const showPay = isOwner || r.userId === user.id;
              return (
                <tr key={r.userId}>
                  <td>{r.name}</td>
                  <td className="num">{r.calls}</td><td className="num">{r.visits}</td><td className="num">{r.conversations}</td>
                  <td className="num">{r.meetingsBooked}</td><td className="num"><strong>{r.meetingsHeld}</strong></td><td className="num">{r.customers}</td>
                  <td className="num">{showPay ? formatCents(c?.commissionCents ?? 0) : '-'}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>Team</td><td className="num">{total.calls}</td><td className="num">{total.visits}</td><td className="num">{total.conversations}</td>
              <td className="num">{total.meetingsBooked}</td><td className="num">{total.meetingsHeld}</td><td className="num">{total.customers}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        Commission is each rep&apos;s percent of what we have earned on the customers they won: the client-confirmed revenue share plus any
        fee per new customer. It grows as those customers keep paying.{isOwner ? ' Set each rep’s percent on the Team page.' : ''}
      </p>
    </>
  );
}
