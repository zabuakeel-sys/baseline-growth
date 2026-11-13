import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { placesConfigured } from '@/lib/places';
import { addTarget, deleteTarget, reviewCandidates, runTarget } from './actions';
import ActionForm from '../ActionForm';

export const dynamic = 'force-dynamic';

type Target = { id: number; client_id: number; client_name: string; what: string; location: string; exclude: string; max_results: number; last_run_at: string | null; last_found: number | null };
type Candidate = { id: number; client_name: string; name: string; address: string; phone: string; website: string; email: string; about: string; rating: number | null; reviews: number | null; score: number; reasons: string };

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });

export default async function FindPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const [clients, targets, queue] = await Promise.all([
    query<{ id: number; name: string }>("SELECT id, name FROM clients WHERE status <> 'ended' ORDER BY name").then((r) => r.rows),
    query<Target>(`SELECT t.*, to_char(t.last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_run_at, c.name AS client_name
                   FROM targets t JOIN clients c ON c.id = t.client_id ORDER BY c.name, t.id`).then((r) => r.rows),
    query<Candidate>(`SELECT k.id, c.name AS client_name, k.name, k.address, k.phone, k.website, k.email, k.about, k.rating, k.reviews, k.score, k.reasons
                      FROM candidates k JOIN clients c ON c.id = k.client_id WHERE k.status = 'found'
                      ORDER BY k.score DESC, k.id LIMIT 200`).then((r) => r.rows),
  ]);
  const connected = placesConfigured();

  return (
    <>
      <h1>Find prospects</h1>
      <p className="sub">
        Save what kind of business each client wants and where. The system searches business listings, reads each
        website for a public contact email, scores fit and lines them up here. Tick the good ones to start outreach.
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}
      {!connected && (
        <div className="card warn-card">
          <strong>Business search is not connected yet.</strong>
          <p style={{ margin: '6px 0 0' }}>
            It needs a Google Places API key: create one in Google Cloud (enable &ldquo;Places API (New)&rdquo;, add billing),
            then add it in Railway on the app service as <code>GOOGLE_PLACES_API_KEY</code>. Google charges per search;
            check their current pricing and set a budget alert.
          </p>
        </div>
      )}

      <section className="card" aria-labelledby="targets-h">
        <h2 id="targets-h">Saved searches</h2>
        {targets.length === 0 && <p className="muted" style={{ marginTop: 0 }}>None yet. Add one below.</p>}
        {targets.map((t) => (
          <div key={t.id} className="target">
            <div>
              <strong>{t.what}</strong> in {t.location} <span className="muted">for <Link href={`/clients/${t.client_id}`}>{t.client_name}</Link></span>
              <div className="task-meta">
                {t.exclude ? `Skipping: ${t.exclude} · ` : ''}up to {t.max_results} per run
                {t.last_run_at ? ` · last run ${when(t.last_run_at)}, ${t.last_found ?? 0} new` : ' · never run'}
              </div>
            </div>
            <div className="actions">
              <ActionForm action={runTarget.bind(null, t.id)}><button type="submit" disabled={!connected}>Run search</button></ActionForm>
              <form action={deleteTarget.bind(null, t.id)}><button type="submit" className="secondary">Remove</button></form>
            </div>
          </div>
        ))}
        <details style={{ marginTop: 12 }} open={targets.length === 0}>
          <summary>Add a search</summary>
          <ActionForm className="grid" action={addTarget}>
            <label>For client
              <select name="client_id" required defaultValue="">
                <option value="" disabled>Pick a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>What kind of business<input name="what" required placeholder="independent auto repair shop" /></label>
            <label>Where<input name="location" required placeholder="Detroit, MI" /></label>
            <label>Results per run<input name="max_results" inputMode="numeric" defaultValue={60} /></label>
            <label className="full">Skip names containing (comma-separated)<input name="exclude" placeholder="Midas, Jiffy Lube, Firestone, Valvoline" /></label>
            <div className="actions full"><button type="submit">Save search</button></div>
          </ActionForm>
        </details>
      </section>

      <section className="card" aria-labelledby="queue-h">
        <h2 id="queue-h">Ready for review ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nothing waiting. Run a search to fill this list.</p>
        ) : (
          <ActionForm action={reviewCandidates}>
            <div className="actions" style={{ marginBottom: 8 }}>
              <button type="submit" name="decision" value="add">Add ticked to prospects</button>
              <button type="submit" name="decision" value="skip" className="secondary">Skip ticked</button>
            </div>
            <ul className="candidates">
              {queue.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input type="checkbox" name="ids" value={c.id} defaultChecked={c.score >= 60 && Boolean(c.email || c.phone)} style={{ minHeight: 0 }} />
                    <span>
                      <strong>{c.name}</strong> <span className="muted">· {c.client_name}</span>
                      <span className={`pill${c.score >= 60 ? ' signed' : ''}`} style={{ marginLeft: 8 }}>Fit {c.score}</span>
                      <span className="task-meta" style={{ display: 'block' }}>
                        {c.address}{c.rating != null ? ` · ${c.rating} stars, ${c.reviews ?? 0} reviews` : ''}
                      </span>
                      <span className="task-meta" style={{ display: 'block' }}>
                        {c.email || 'no email found'}{c.phone ? ` · ${c.phone}` : ''}
                        {c.website && <> · <a href={c.website} target="_blank" rel="noopener noreferrer nofollow">website</a></>}
                      </span>
                      {c.about && <span style={{ display: 'block', fontSize: 14 }}>{c.about}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </ActionForm>
        )}
      </section>
    </>
  );
}
