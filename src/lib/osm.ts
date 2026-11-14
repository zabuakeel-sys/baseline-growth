// A free business source backed by OpenStreetMap: Nominatim to turn a place name into a map area,
// then the Overpass API to list businesses of a kind inside it. No API key, no billing, no card.
// The pure query-building and parsing live in osm.js (unit-tested); this file only does the network.
// Used automatically when Google Places is blocked or over quota, and when there is no Google key.
//
// OSM_NOMINATIM_URL / OSM_OVERPASS_URL point at stand-in servers for tests.

import type { Place } from './places';
import { splitQuery, filtersFor, bboxParam, overpassBody, placesFromOverpass, geocodeCandidates } from './osmcore.js';

export { splitQuery };

// A plain, generic client name. Nominatim's usage policy asks for one; it must carry nothing that
// identifies the user (no name, no email).
const USER_AGENT = 'BaselineGrowthLeadEngine/1.0';

// Public Overpass instances, tried in turn: the free servers are often briefly busy (502/504/429),
// so a failover to the next mirror turns a transient outage into a successful search. These must all
// carry the WHOLE planet, not a regional extract (a Switzerland-only mirror returns 0 for New York).
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

type Geo = { bbox: string; boundingbox: [string, string, string, string] };
const geocodeCache = new Map<string, Geo | null>();

/** Turn a place name ("Detroit, MI") into a bounding box, via Nominatim. Cached per run. */
async function geocode(location: string): Promise<Geo> {
  const cacheKey = location.trim().toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    const hit = geocodeCache.get(cacheKey);
    if (hit) return hit;
    throw new Error(`OpenStreetMap could not find the place "${location}".`);
  }
  const base = process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
  // Try the name as given and a tidied version ("Detroit Metro Area, MI" -> "Detroit, MI").
  for (const place of geocodeCandidates(location)) {
    const url = `${base}?q=${encodeURIComponent(place)}&format=json&limit=1`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new Error(`OpenStreetMap did not answer the place lookup for "${location}" in time; it may be busy. Will retry.`);
    }
    if (!res.ok) throw new Error(`OpenStreetMap lookup for "${location}" returned ${res.status}.`);
    const data = (await res.json().catch(() => [])) as { boundingbox?: [string, string, string, string] }[];
    const boundingbox = data[0]?.boundingbox ?? null;
    const bbox = bboxParam(boundingbox);
    if (bbox && boundingbox) {
      const geo: Geo = { bbox, boundingbox };
      geocodeCache.set(cacheKey, geo);
      return geo;
    }
  }
  geocodeCache.set(cacheKey, null);
  throw new Error(`OpenStreetMap could not find the place "${location}". Use a specific city, like "Detroit, MI".`);
}

/** Rough bounding-box area in square degrees, to spot a location too broad for one Overpass query. */
function bboxArea(bb: [string, string, string, string]): number {
  const [south, north, west, east] = bb.map(Number);
  return Math.abs((north - south) * (east - west));
}

/**
 * Search OpenStreetMap for businesses matching a "<what> in <location>" query. Returns up to
 * `maxResults`, contactable ones first (the only ones outreach can use).
 */
export async function searchOSM(textQuery: string, maxResults: number): Promise<Place[]> {
  const { what, location } = splitQuery(textQuery);
  if (!location) throw new Error('OpenStreetMap needs a location to search in.');
  const { bbox, boundingbox } = await geocode(location);
  // A country- or multi-state-sized box makes Overpass scan too much and time out. Ask to narrow it.
  const area = bboxArea(boundingbox);
  if (area > 30) throw new Error(`"${location}" covers too large an area for one search. Use a city or metro, like "Detroit, MI", so the free map service can answer quickly.`);
  const filters = filtersFor(what);
  // Ask for more than we need, since many OSM entries have no phone or website and get filtered out.
  const cap = Math.min(200, Math.max(maxResults * 4, 60));
  const body = overpassBody(filters, bbox, cap);
  console.log(`OSM search: "${what}" in "${location}" | bbox ${bbox} | area ${area.toFixed(2)}`);
  const data = await overpassQuery(body);
  const places = placesFromOverpass(data.elements ?? [], maxResults) as Place[];
  console.log(`OSM search: "${what}" in "${location}" -> ${data.elements?.length ?? 0} found, ${places.length} usable`);
  return places;
}

type OverpassData = { elements?: Parameters<typeof placesFromOverpass>[0]; remark?: string };

/** POST an Overpass query, failing over across the public mirrors when one is busy (502/504/429/timeout). */
async function overpassQuery(body: string): Promise<OverpassData> {
  // A single override (tests) replaces the mirror list.
  const mirrors = process.env.OSM_OVERPASS_URL ? [process.env.OSM_OVERPASS_URL] : OVERPASS_MIRRORS;
  let lastError = 'OpenStreetMap is busy right now. Will retry shortly.';
  let emptyResult: OverpassData | null = null; // a clean but empty answer, trusted only if every mirror agrees
  for (const url of mirrors) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(body)}`,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      lastError = 'OpenStreetMap was too slow to answer (the free service is busy). Will retry shortly.';
      continue; // this mirror timed out or refused; try the next
    }
    // 429/5xx mean this mirror is busy or down: move on to the next.
    if (res.status === 429 || res.status >= 500) { lastError = `OpenStreetMap mirror returned ${res.status}.`; continue; }
    if (!res.ok) throw new Error(`OpenStreetMap search returned ${res.status}.`);
    const data = (await res.json().catch(() => ({}))) as OverpassData;
    // Overpass reports server-side timeouts/overload as a 200 with a "remark", not an HTTP error.
    if ((!data.elements || data.elements.length === 0) && data.remark && /timed out|runtime error|out of memory/i.test(data.remark)) {
      lastError = 'OpenStreetMap could not finish the search in time (the free service was busy). Will retry shortly.';
      continue;
    }
    // Real results: done. An empty answer could be a stale or regional mirror, so keep it aside and
    // try the others; only return empty if no mirror has data.
    if (data.elements && data.elements.length > 0) return data;
    emptyResult = data;
  }
  if (emptyResult) return emptyResult;
  throw new Error(lastError);
}
