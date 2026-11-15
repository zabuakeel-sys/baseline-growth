// Turning a street address into map coordinates, via Nominatim (free, OpenStreetMap). Used to order
// a rep's visits into the shortest route. Coordinates are cached on the lead so an address is
// geocoded at most once.
import { query } from './db';

const USER_AGENT = 'BaselineGrowthLeadEngine/1.0';
const base = () => process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bounds so a slow or down Nominatim can never hang a request: at most this many lookups, and stop
// after this long, routing with whatever coordinates we already have.
const MAX_GEOCODES = 8;
const DEADLINE_MS = 18_000;

/** Coordinates for one address, or null. Nominatim asks for ~1 request/second; callers space calls. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = (address || '').trim();
  if (q.length < 6) return null;
  try {
    const url = `${base()}?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = rows?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

type LeadLoc = { id: number; lat: number | null; lng: number | null; address: string };

/**
 * Makes sure each lead has coordinates, geocoding the ones that are missing (and saving them). Runs
 * the lookups one at a time to respect Nominatim's rate limit. Returns the leads with coordinates
 * filled in where they could be found.
 */
export async function ensureCoords(leads: LeadLoc[]): Promise<LeadLoc[]> {
  const start = Date.now();
  let done = 0;
  for (const l of leads) {
    if ((l.lat != null && l.lng != null) || !l.address) continue;
    if (done >= MAX_GEOCODES || Date.now() - start > DEADLINE_MS) break; // never hang on a slow service
    const geo = await geocodeAddress(l.address);
    done += 1;
    if (geo) {
      l.lat = geo.lat;
      l.lng = geo.lng;
      await query('UPDATE leads SET lat = $2, lng = $3 WHERE id = $1', [l.id, geo.lat, geo.lng]);
    }
    await sleep(900); // be polite to the free service
  }
  return leads;
}

/**
 * Fills coordinates for prospects that have an address but no coordinates yet, a few per run, so the
 * "plan my route" button rarely has to geocode on demand. Bounded by ensureCoords; safe to call often.
 */
export async function geocodeDueLeads(max = MAX_GEOCODES): Promise<number> {
  const rows = (await query<LeadLoc>(
    `SELECT id, lat, lng, address FROM leads
      WHERE lat IS NULL AND address <> '' AND status IN ('new', 'following_up', 'talking')
      ORDER BY received_on DESC, id DESC LIMIT $1`, [max])).rows;
  if (!rows.length) return 0;
  await ensureCoords(rows);
  return rows.filter((r) => r.lat != null).length;
}
