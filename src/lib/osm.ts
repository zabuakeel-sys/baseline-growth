// A free business source backed by OpenStreetMap: Nominatim to turn a place name into a map area,
// then the Overpass API to list businesses of a kind inside it. No API key, no billing, no card.
// The pure query-building and parsing live in osm.js (unit-tested); this file only does the network.
// Used automatically when Google Places is blocked or over quota, and when there is no Google key.
//
// OSM_NOMINATIM_URL / OSM_OVERPASS_URL point at stand-in servers for tests.

import type { Place } from './places';
import { splitQuery, filtersFor, bboxParam, overpassBody, placesFromOverpass } from './osmcore.js';

export { splitQuery };

// A plain, generic client name. Nominatim's usage policy asks for one; it must carry nothing that
// identifies the user (no name, no email).
const USER_AGENT = 'BaselineGrowthLeadEngine/1.0';

const geocodeCache = new Map<string, string | null>();

/** Turn a place name ("Detroit, MI") into an Overpass bbox param, via Nominatim. Cached per run. */
async function geocode(location: string): Promise<string> {
  const cacheKey = location.trim().toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    const hit = geocodeCache.get(cacheKey);
    if (hit) return hit;
    throw new Error(`OpenStreetMap could not find the place "${location}".`);
  }
  const base = process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
  const url = `${base}?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenStreetMap lookup for "${location}" returned ${res.status}.`);
  const data = (await res.json().catch(() => [])) as { boundingbox?: [string, string, string, string] }[];
  const bbox = bboxParam(data[0]?.boundingbox ?? null);
  if (!bbox) { geocodeCache.set(cacheKey, null); throw new Error(`OpenStreetMap could not find the place "${location}".`); }
  geocodeCache.set(cacheKey, bbox);
  return bbox;
}

/**
 * Search OpenStreetMap for businesses matching a "<what> in <location>" query. Returns up to
 * `maxResults`, contactable ones first (the only ones outreach can use).
 */
export async function searchOSM(textQuery: string, maxResults: number): Promise<Place[]> {
  const { what, location } = splitQuery(textQuery);
  if (!location) throw new Error('OpenStreetMap needs a location to search in.');
  const bbox = await geocode(location);
  const filters = filtersFor(what);
  // Ask for more than we need, since many OSM entries have no phone or website and get filtered out.
  const cap = Math.min(200, Math.max(maxResults * 4, 60));
  const body = overpassBody(filters, bbox, cap);
  const url = process.env.OSM_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: `data=${encodeURIComponent(body)}`,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenStreetMap search returned ${res.status}. The free map service may be busy; it usually clears in a minute.`);
  const data = (await res.json().catch(() => ({}))) as { elements?: Parameters<typeof placesFromOverpass>[0] };
  return placesFromOverpass(data.elements ?? [], maxResults) as Place[];
}
