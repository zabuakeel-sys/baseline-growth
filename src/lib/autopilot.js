// Autopilot rules: which saved search to run next, how many prospects to add, and which rep
// gets each one. Plain JS so tests can load it directly.

/** A search is run once, then refreshed after `refreshDays` to catch new businesses. */
export const REFRESH_DAYS = 30;

/** Fit score a business needs to be added without a person looking at it. */
export const AUTO_ADD_SCORE = 60;

/**
 * Marketplaces want exactly the shops that score low on the usual signals: no website yet, few
 * reviews. The play's fit boost lifts them, but they still land under the normal floor, so a
 * listing client uses a lower one. They must still have a phone or email to be reachable.
 */
export const MARKETPLACE_ADD_SCORE = 45;

/** The auto-add floor for a client, by its play. */
export function addFloorFor(play) {
  return play === 'claim_listing' ? MARKETPLACE_ADD_SCORE : AUTO_ADD_SCORE;
}

const daysAgo = (iso, today) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** Hours a failed search waits before it is tried again: 1, 2, 4 ... up to 24. */
export function failCooldownHours(failCount) {
  return Math.min(24, 2 ** Math.max(0, (failCount || 1) - 1));
}

/** True while a search that failed recently is still waiting to be retried. */
export function coolingDown(t, nowMs) {
  if (!t.failed_at || !t.fail_count) return false;
  return nowMs - Date.parse(t.failed_at) < failCooldownHours(t.fail_count) * 3_600_000;
}

/**
 * The next search to run: never-run ones first (oldest added), then the stalest past the refresh
 * window. A search that just failed is skipped for a while, so the others still get their turn.
 */
export function dueTarget(targets, today, refreshDays = REFRESH_DAYS, nowMs = Date.now()) {
  targets = targets.filter((t) => !coolingDown(t, nowMs));
  const never = targets.filter((t) => !t.last_run_at).sort((a, b) => a.id - b.id);
  if (never.length) return never[0];
  const stale = targets.filter((t) => daysAgo(t.last_run_at, today) >= refreshDays)
    .sort((a, b) => a.last_run_at.localeCompare(b.last_run_at) || a.id - b.id);
  return stale[0] ?? null;
}

/**
 * How many new prospects to add for a client right now. Stops at the daily cap, and also when
 * reps already have a full untouched pile (twice the daily cap), so prospects never go stale
 * waiting for a first call.
 */
export function prospectsToAdd({ dailyCap, addedToday, untouched }) {
  return Math.max(0, Math.min(dailyCap - addedToday, dailyCap * 2 - untouched));
}

/** The rep with the fewest open prospects gets the next one; ties go to the earliest rep. */
export function pickRep(repIds, openCounts) {
  if (!repIds.length) return null;
  return [...repIds].sort((a, b) => (openCounts[a] ?? 0) - (openCounts[b] ?? 0) || a - b)[0];
}

/** Candidates good enough to add without review, best first. */
export function autoAddable(candidates, minScore = AUTO_ADD_SCORE) {
  return candidates.filter((c) => c.score >= minScore && (c.email || c.phone))
    .sort((a, b) => b.score - a.score || a.id - b.id);
}
