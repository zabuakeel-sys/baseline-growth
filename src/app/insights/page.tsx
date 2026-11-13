import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { funnel, lossReasons } from '@/lib/playbook';

export const dynamic = 'force-dynamic';

/** Where each client's prospects drop off, and why deals are lost: what to fix in the script or offer. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireUser();
  const days = Math.min(365, Math.max(7, Number((await searchParams).days) || 90));
  const [clients, leads, activities, meetings] = await Promise.all([
    query<{ id: number; name: string }>("SELECT id, name FROM clients WHERE status <> 'ended' ORDER BY name").then((r) => r.rows),
    query<{ id: number; client_id: number; status: string; touches_sent: number; lost_reason: string }>(
      `SELECT id, client_id, status, touches_sent, lost_reason FROM leads WHERE received_on >= (now() AT TIME ZONE 'America/Detroit')::date - $1::int`, [days]).then((r) => r.rows),
    query<{ lead_id: number; outcome: string }>(
      `SELECT a.lead_id, a.outcome FROM activities a JOIN leads l ON l.id = a.lead_id WHERE l.received_on >= (now() AT TIME ZONE 'America/Detroit')::date - $1::int`, [days]).then((r) => r.rows),
    query<{ lead_id: number; status: string }>(
      `SELECT m.lead_id, m.status FROM meetings m JOIN leads l ON l.id = m.lead_id WHERE l.received_on >= (now() AT TIME ZONE 'America/Detroit')::date - $1::int`, [days]).then((r) => r.rows),
  ]);

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>Insights</h1>
          <p className="sub" style={{ margin: 0 }}>Where prospects drop off and why deals are lost, for prospects added in the last {days} days.</p>
        </div>
        <div className="segmented" role="group" aria-label="Period">
          {[30, 90, 365].map((d) => <Link key={d} href={`/insights?days=${d}`} aria-current={d === days ? 'true' : undefined}>{d} days</Link>)}
        </div>
      </div>
      {clients.map((c) => {
        const mine = leads.filter((l) => l.client_id === c.id);
        const ids = new Set(mine.map((l) => l.id));
        const f = funnel({ leads: mine, activities: activities.filter((a) => ids.has(a.lead_id)), meetings: meetings.filter((m) => ids.has(m.lead_id)) });
        const losses = lossReasons(mine.filter((l) => l.status === 'lost'));
        const steps = [
          ['Prospects', f.prospects], ['Reached', f.reached], ['Conversations', f.conversations], ['Meetings held', f.meetingsHeld], ['Customers', f.customers],
        ] as const;
        const drops = steps.slice(1).map(([name, n], i) => ({ name, rate: steps[i][1] ? Math.round((n / steps[i][1]) * 100) : null }));
        const weakest = drops.filter((d) => d.rate !== null).sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))[0];
        return (
          <section key={c.id} className="card" aria-labelledby={`c${c.id}`}>
            <h2 id={`c${c.id}`}><Link href={`/clients/${c.id}`}>{c.name}</Link></h2>
            {mine.length === 0 ? <p className="muted" style={{ margin: 0 }}>No prospects in this period.</p> : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr>{steps.map(([name]) => <th key={name} className="num">{name}</th>)}</tr></thead>
                    <tbody>
                      <tr>{steps.map(([name, n]) => <td key={name} className="num"><strong>{n}</strong></td>)}</tr>
                      <tr className="muted">{[<td key="first" />, ...drops.map((d) => <td key={d.name} className="num">{d.rate === null ? '-' : `${d.rate}% of previous`}</td>)]}</tr>
                    </tbody>
                  </table>
                </div>
                {weakest && f.prospects >= 20 && (
                  <p><strong>Biggest drop:</strong> {weakest.name.toLowerCase()} ({weakest.rate}% of the step before).{' '}
                    {weakest.name === 'Reached' && 'Contact details or volume: are reps working the list?'}
                    {weakest.name === 'Conversations' && 'Openers and timing: try calls and visits over email, and a sharper first line.'}
                    {weakest.name === 'Meetings held' && 'The ask: a smaller first step, and confirm meetings the day before.'}
                    {weakest.name === 'Customers' && "The client's offer or follow-up speed: review lost reasons with them."}
                  </p>
                )}
                {f.prospects < 20 && <p className="muted">Fewer than 20 prospects: too few to judge yet.</p>}
                <h3>Why deals were lost</h3>
                {losses.length === 0 ? <p className="muted" style={{ margin: 0 }}>No losses recorded.</p> : (
                  <ul className="plain-list">
                    {losses.map((l) => <li key={l.reason}><strong>{l.reason}</strong>: {l.count} ({l.percent}%)</li>)}
                  </ul>
                )}
                <p style={{ marginBottom: 0 }}><Link href={`/clients/${c.id}#script-h`}>Update the {c.name} script with answers to the top reasons</Link></p>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
