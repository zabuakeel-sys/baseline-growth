// Turning a street address into map coordinates, via Nominatim (free, OpenStreetMap). Used to order
// a rep's visits into the shortest route. Coordinates are cached on the lead so an address is
// geocoded at most once.
import { query } from './db';

const USER_AGENT = 'BaselineGrowthLeadEngine/1.0';
const base = () => process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Coordinates for one address, or null. Nominatim asks for ~1 request/second; callers space calls. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = (address || '').trim();
  if (q.length < 6) return null;
  try {
    const url = `${base()}?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
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
  for (const l of leads) {
    if ((l.lat != null && l.lng != null) || !l.address) continue;
    const geo = await geocodeAddress(l.address);
    if (geo) {
      l.lat = geo.lat;
      l.lng = geo.lng;
      await query('UPDATE leads SET lat = $2, lng = $3 WHERE id = $1', [l.id, geo.lat, geo.lng]);
    }
    await sleep(1100); // be polite to the free service
  }
  return leads;
}
