import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clients';
import { query } from '@/lib/db';
import { setupSteps } from '@/lib/setup';
import { today } from '@/lib/work';

export const dynamic = 'force-dynamic';

/** The owner's Overview: the week's pulse, what needs them, and each business's health. Reps go to Today. */
export default async function Overview({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/next');
  const { saved } = await searchParams;
  const now = today();

  const [week, prior, drafts, failedRow, clients, spark] = await Promise.all([
    query<{ emails: number; replies: number; customers: number; inplay: number }>(
      `SELECT (SELECT count(*)::int FROM outbox WHERE status='sent' AND kind='sequence' AND sent_at > now()-interval '7 days') AS emails,
              (SELECT count(*)::int FROM replies WHERE kind='reply' AND received_at > now()-interval '7 days') AS replies,
              (SELECT count(*)::int FROM leads WHERE status='won' AND customer_since > $1::date - 7) AS customers,
              (SELECT count(*)::int FROM leads WHERE status IN ('new','following_up','talking')) AS inplay`, [now]).then((r) => r.rows[0]),
    query<{ emails: number }>(
      `SELECT count(*)::int AS emails FROM outbox WHERE status='sent' AND kind='sequence' AND sent_at > now()-interval '14 days' AND sent_at <= now()-interval '7 days'`).then((r) => r.rows[0]),
    query<{ id: number; lead: string; client: string }>(
      `SELECT o.id, l.name AS lead, c.name AS client FROM outbox o JOIN leads l ON l.id=o.lead_id JOIN clients c ON c.id=l.client_id
       WHERE o.kind='reply' AND o.status='pending' ORDER BY o.created_at LIMIT 6`).then((r) => r.rows),
    query<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE status='failed'").then((r) => r.rows[0]),
    listClients().then((rows) => rows.filter((c) => c.status !== 'ended')),
    query<{ n: number }>(
      `SELECT count(o.id)::int AS n FROM generate_series(0,7) g
       LEFT JOIN outbox o ON o.status='sent' AND o.sent_at >= now()-((g+1)||' weeks')::interval AND o.sent_at < now()-(g||' weeks')::interval
       GROUP BY g ORDER BY g DESC`).then((r) => r.rows.map((x) => x.n)),
  ]);

  // What needs the owner, in order.
  type Need = { icon: 'hot' | 'mail'; a: string; b: string; href: string; cta: string; sec?: boolean };
  const needs: Need[] = [];
  for (const d of drafts) needs.push({ icon: 'hot', a: `${d.lead} replied`, b: `${d.client} · reply drafted, ready to send`, href: '/outbox#drafts-h', cta: 'Approve reply' });
  const health = new Map<number, 'ok' | 'warn'>();
  for (const c of clients) {
    const steps = await setupSteps(c);
    const next = steps.find((s) => !s.done && s.key !== 'live');
    if (next) {
      health.set(c.id, 'warn');
      needs.push({ icon: 'mail', a: `${c.name} — ${next.key === 'approve' ? 'approve the first email' : next.action.toLowerCase()}`, b: next.key === 'approve' ? 'Ready to start sending' : next.key === 'prospects' ? 'Getting prospects' : 'Finish setting up', href: next.key === 'approve' ? `/clients/${c.id}/settings#approve-h` : next.href, cta: 'Open', sec: true });
    } else {
      health.set(c.id, c.outreach_approved_at ? 'ok' : 'warn');
    }
  }
  if (failedRow.n > 0) needs.push({ icon: 'mail', a: `${failedRow.n} email${failedRow.n === 1 ? '' : 's'} failed to send`, b: 'Usually a mailbox password or limit', href: '/outbox', cta: 'See why', sec: true });

  const max = Math.max(...spark, 1);
  const pts = spark.map((n, i) => `${(i / (spark.length - 1)) * 120},${26 - (n / max) * 22}`).join(' ');
  const delta = week.emails - prior.emails;

  return (
    <>
      <div className="page-head">
        <div><h1>Overview</h1><p className="sub">This week, across your businesses.</p></div>
        <div className="right"><Link className="button" href="/clients/new">Add a business</Link></div>
      </div>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <div className="kpis">
        <div className="kpi"><div className="v">{week.emails}</div><div className="l">Emails sent this week</div>
          {prior.emails > 0 && <div className={`dl ${delta >= 0 ? 'up' : 'flat'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs last week</div>}</div>
        <div className="kpi"><div className="v">{week.replies}</div><div className="l">Replies this week</div>
          {drafts.length > 0 && <div className="dl up">▲ {drafts.length} waiting for you</div>}</div>
        <div className="kpi"><div className="v">{week.customers}</div><div className="l">New customers this week</div></div>
        <div className="kpi"><div className="v">{week.inplay}</div><div className="l">Prospects in play</div>
          <svg width="100%" height="26" viewBox="0 0 120 26" preserveAspectRatio="none" style={{ marginTop: 8, display: 'block' }}>
            <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={pts} />
          </svg>
        </div>
      </div>

      <div className="cols">
        <div>
          <p className="lab">Needs you now</p>
          {needs.length === 0 ? (
            <div className="need"><div className="ic mail">✓</div><div className="tx"><div className="a">All clear</div><div className="b">Nothing is waiting on you. The machine is running.</div></div></div>
          ) : needs.map((n, i) => (
            <div className="need" key={i}>
              <div className={`ic ${n.icon}`}>{n.icon === 'hot' ? '↩' : '✎'}</div>
              <div className="tx"><div className="a">{n.a}</div><div className="b">{n.b}</div></div>
              <Link className={`go ${n.sec ? 'sec' : ''}`} href={n.href}>{n.cta}</Link>
            </div>
          ))}
        </div>
        <div>
          <p className="lab">Your businesses</p>
          {clients.length === 0 ? (
            <div className="need"><div className="tx"><div className="a">No businesses yet</div><div className="b">Add your first one to start.</div></div><Link className="go" href="/clients/new">Add</Link></div>
          ) : clients.map((c) => (
            <Link className="bizrow" key={c.id} href={`/clients/${c.id}`}>
              {c.logo_url ? <img className="lg" src={c.logo_url} alt="" /> : <span className="lg">{c.name.slice(0, 1)}</span>}
              <div className="tx"><div className="a">{c.name}</div>
                <div className="b">{c.outreach_approved_at ? `Emailing on its own · ${c.prospects} in play` : 'Setting up'}{c.customers > 0 ? ` · ${c.customers} customer${c.customers === 1 ? '' : 's'}` : ''}</div></div>
              <span className={`hd ${health.get(c.id) === 'warn' ? 'warn' : 'ok'}`}></span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
