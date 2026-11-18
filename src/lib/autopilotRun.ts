// Autopilot: for every business it is on for, keeps each rep supplied with fresh prospects.
// Runs inside the background outreach run (every 5 minutes) and from "Run now".
import { query } from './db';
import { autoAddable, addFloorFor, dueTarget, pickRep, prospectsToAdd } from './autopilot';
import { addCandidates, runSearch } from './finderRun';
import { placesConfigured } from './places';
import { today } from './work';

// After a failed search, wait a short while before trying again. The source is free (OpenStreetMap),
// so a failure is usually the free service being briefly busy, not a problem that needs a long pause.
let searchPausedUntil = 0;
const PAUSE_AFTER_FAILURE_MS = 8 * 60_000;

export type AutopilotReport = { searches: number; added: number; notes: string[] };

export async function runAutopilot(): Promise<AutopilotReport> {
  const report: AutopilotReport = { searches: 0, added: 0, notes: [] };
  const clients = (await query<{ id: number; name: string; daily_prospects: number; play: string }>(
    "SELECT id, name, daily_prospects, play FROM clients WHERE autopilot AND status <> 'ended' AND daily_prospects > 0 ORDER BY id")).rows;
  if (!clients.length) return report;

  // Reps get the prospects; with no reps yet, the owners do.
  let reps = (await query<{ id: number }>("SELECT id FROM users WHERE role = 'team' ORDER BY id")).rows.map((r) => r.id);
  if (!reps.length) reps = (await query<{ id: number }>("SELECT id FROM users WHERE role = 'owner' ORDER BY id")).rows.map((r) => r.id);
  const open: Record<number, number> = {};
  for (const r of (await query<{ assignee_id: number; n: number }>(
    "SELECT assignee_id, count(*)::int AS n FROM leads WHERE status IN ('new', 'following_up', 'talking') AND assignee_id IS NOT NULL GROUP BY assignee_id")).rows) {
    open[r.assignee_id] = r.n;
  }
  const assign = () => {
    const rep = pickRep(reps, open);
    if (rep !== null) open[rep] = (open[rep] ?? 0) + 1;
    return rep;
  };

  const settings = (await query<{ max_searches_per_day: number }>('SELECT max_searches_per_day FROM outreach_settings WHERE id = 1')).rows[0];
  let searchesLeft = Math.max(0, settings.max_searches_per_day - Number((await query<{ n: string }>(
    `SELECT count(*) AS n FROM targets WHERE (last_run_at AT TIME ZONE 'America/Detroit')::date = (now() AT TIME ZONE 'America/Detroit')::date`)).rows[0].n));
  const canSearch = placesConfigured() && Date.now() >= searchPausedUntil;
  if (placesConfigured() && !canSearch) report.notes.push(`Search paused after a failure; retrying after ${new Date(searchPausedUntil).toISOString().slice(11, 16)} UTC`);
  const now = today();

  for (const client of clients) {
    const counts = (await query<{ added_today: number; untouched: number }>(
      `SELECT count(*) FILTER (WHERE source = 'Research' AND received_on = $2)::int AS added_today,
              count(*) FILTER (WHERE status = 'new' AND touches_sent = 0
                AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = leads.id))::int AS untouched
       FROM leads WHERE client_id = $1`, [client.id, now])).rows[0];
    let want = prospectsToAdd({ dailyCap: client.daily_prospects, addedToday: counts.added_today, untouched: counts.untouched });
    if (want <= 0) continue;

    const loadPool = async () => autoAddable((await query<{ id: number; score: number; email: string; phone: string }>(
      "SELECT id, score, email, phone FROM candidates WHERE client_id = $1 AND status = 'found'", [client.id])).rows, addFloorFor(client.play));
    let pool = await loadPool();
    let failures = 0;
    while (pool.length < want && canSearch && searchesLeft > 0 && failures < 2) {
      const targets = (await query<{ id: number; last_run_at: string | null; failed_at: string | null; fail_count: number }>(
        `SELECT id, to_char(last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_run_at,
                to_char(failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS failed_at, fail_count
         FROM targets WHERE client_id = $1`,
        [client.id])).rows;
      const next = dueTarget(targets, now);
      if (!next) break;
      searchesLeft--;
      report.searches++;
      try {
        await runSearch(next.id);
      } catch (err) {
        report.notes.push(`${client.name}: search failed: ${(err as Error).message}`);
        console.error(`autopilot: ${client.name} search failed:`, (err as Error).message);
        // This search now waits before its next try; move on to the business's next search.
        // Two failures in one run usually means the source itself is down: pause all searching briefly.
        failures++;
        if (failures >= 2) searchPausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
        continue;

      }
      pool = await loadPool();
    }
    if (!pool.length) {
      if (!placesConfigured()) report.notes.push(`${client.name}: business search is not connected`);
      continue;
    }
    const take = pool.slice(0, want).map((c) => c.id);
    const { added } = await addCandidates(take, assign);
    report.added += added;
    want -= added;
  }
  if (canSearch && searchesLeft <= 0 && Date.now() >= searchPausedUntil) report.notes.push('Daily search limit reached');
  if (report.searches || report.added || report.notes.length) {
    console.log(`autopilot: ${report.searches} searches, ${report.added} added${report.notes.length ? ` | ${report.notes.join(' | ')}` : ''}`);
  }
  return report;
}
