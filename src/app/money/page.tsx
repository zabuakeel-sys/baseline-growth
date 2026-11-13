import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { allStatements, monthLabel, today } from '@/lib/work';
import { formatCents } from '@/lib/money';
import { addMonths, monthOf } from '@/lib/billing';
import { recordPayment } from '../work/actions';
import ActionForm from '../ActionForm';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { paid: 'Paid', open: 'Due', late: 'Late', upcoming: 'This month' } as const;

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireOwner();
  const { saved } = await searchParams;
  const statements = await allStatements();
  const now = today();
  const thisMonth = monthOf(now);

  const unpaid = statements.flatMap(({ client, rows }) =>
    rows.filter((r) => r.balanceCents > 0).map((r) => ({ client, ...r })),
  ).sort((a, b) => a.month.localeCompare(b.month) || a.client.name.localeCompare(b.client.name));
  const lateTotal = unpaid.filter((r) => r.status === 'late').reduce((s, r) => s + r.balanceCents, 0);
  const owedTotal = unpaid.filter((r) => r.status !== 'upcoming').reduce((s, r) => s + r.balanceCents, 0);
  const lastFull = statements.reduce((s, { rows }) => s + (rows.find((r) => r.month === addMonths(thisMonth, -1))?.dueCents ?? 0), 0);
  const paidAllTime = statements.reduce((s, { rows }) => s + rows.reduce((t, r) => t + r.paidCents, 0), 0);
  const waitingTotal = statements.reduce((s, { rows }) => s + rows.reduce((t, r) => t + r.waitingCents, 0), 0);

  return (
    <>
      <h1>Money</h1>
      <p className="sub">What clients owe us. Each month is due on the 15th of the next month.</p>
      {saved && <p className="notice" role="status">Payment recorded.</p>}

      <div className="stats">
        <div className="stat"><div className="label">Earned last month</div><div className="value">{formatCents(lastFull)}</div></div>
        <div className="stat"><div className="label">Owed now</div><div className="value">{formatCents(owedTotal)}</div></div>
        <div className="stat"><div className="label">Late</div><div className={`value${lateTotal ? ' late' : ''}`}>{formatCents(lateTotal)}</div></div>
        <div className="stat"><div className="label">Collected to date</div><div className="value">{formatCents(paidAllTime)}</div></div>
      </div>

      <section className="card table-wrap" aria-labelledby="unpaid-h">
        <h2 id="unpaid-h">Unpaid</h2>
        {statements.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No billed clients yet. A client is billed once it is active and has a contract start date and deal terms.
          </p>
        ) : unpaid.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Everything is paid.</p>
        ) : (
          <table>
            <thead><tr><th>Client</th><th>Month</th><th className="num">Share</th><th className="num">New customers</th><th className="num">Fee</th><th className="num">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {unpaid.map((r) => (
                <tr key={`${r.client.id}-${r.month}`}>
                  <td><Link href={`/clients/${r.client.id}#money-h`}>{r.client.name}</Link></td>
                  <td>{monthLabel(r.month)}</td>
                  <td className="num">{formatCents(r.shareCents)}</td>
                  <td className="num">{r.signups ? `${r.signups}${r.signupCents ? ` · ${formatCents(r.signupCents)}` : ''}` : '-'}</td>
                  <td className="num">{r.feeCents ? formatCents(r.feeCents) : '-'}</td>
                  <td className="num"><strong>{formatCents(r.balanceCents)}</strong></td>
                  <td><span className={`pill ${r.status === 'late' ? 'late' : r.status === 'upcoming' ? '' : 'missing'}`}>{STATUS_LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {waitingTotal > 0 && (
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            Another {formatCents(waitingTotal)} of revenue share is waiting: the client reported what those customers paid but has not
            confirmed it yet. Only confirmed amounts are billed.
          </p>
        )}
      </section>

      {statements.length > 0 && (
        <section className="card">
          <h2>Record a payment</h2>
          <ActionForm className="grid" action={recordPayment}>
            <label>Client
              <select name="client_id" required defaultValue="">
                <option value="" disabled>Pick a client</option>
                {statements.map(({ client }) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <label>For month<input name="month" type="month" defaultValue={unpaid[0]?.month.slice(0, 7) ?? thisMonth.slice(0, 7)} required /></label>
            <label>Amount ($)<input name="amount" inputMode="decimal" required /></label>
            <label>Received on<input name="received_on" type="date" defaultValue={now} required /></label>
            <label className="full">Note<input name="note" placeholder="Check number, transfer reference" /></label>
            <div className="actions full"><button type="submit">Record payment</button></div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
