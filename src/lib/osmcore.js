// Pure helpers for the free OpenStreetMap business source (no network here, so they are unit-tested).
// osm.ts does the actual Nominatim and Overpass calls and uses these to build queries and read results.

/** Split a "<what> in <location>" query into its parts. */
export function splitQuery(textQuery) {
  const m = String(textQuery).match(/^(.*)\sin\s(.+)$/i);
  return m ? { what: m[1].trim(), location: m[2].trim() } : { what: String(textQuery).trim(), location: '' };
}

/**
 * Tidy a place name so a map lookup can find it: drop "metro area" / "metropolitan" / a leading
 * "greater", which name a region no gazetteer pins to one point. "Detroit Metro Area, MI" -> "Detroit, MI".
 * A plain city or "City, ST" is returned unchanged.
 */
export function normalizeLocation(location) {
  let s = String(location);
  s = s.replace(/\bmetro(politan)?\s+area\b/gi, ' ');
  s = s.replace(/\bmetro(politan)?\b/gi, ' ');
  s = s.replace(/^\s*greater\s+/i, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
  s = s.replace(/^,+|,+$/g, '').trim();
  return s;
}

/** The place names to try for geocoding, best first, without duplicates or blanks. */
export function geocodeCandidates(location) {
  const out = [];
  for (const c of [normalizeLocation(location), String(location).trim()]) {
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * The OSM tag filters for a kind of business, by keyword. Each string is an Overpass element filter
 * body (applied to node, way and relation). An unrecognised kind falls back to matching the most
 * significant word against business names across shops, offices and amenities.
 */
export function filtersFor(what) {
  const w = String(what).toLowerCase();
  if (/\b(repair|mechanic|auto|car|garage|body ?shop|collision|tire|tyre|muffler|brake|transmission)\b/.test(w))
    return ['["shop"="car_repair"]', '["shop"="tyres"]', '["shop"="car_parts"]'];
  if (/\b(dealer|dealership)\b/.test(w)) return ['["shop"="car"]'];
  if (/\b(dentist|dental|orthodont|endodont)\b/.test(w)) return ['["amenity"="dentist"]', '["healthcare"="dentist"]'];
  if (/\b(doctor|physician|medical|clinic|health|urgent ?care|pediatric|chiropract|dermatolog|optometr|eye)\b/.test(w))
    return ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"]'];
  if (/\b(vet|veterinar|animal)\b/.test(w)) return ['["amenity"="veterinary"]'];
  if (/\b(pharmacy|drugstore)\b/.test(w)) return ['["amenity"="pharmacy"]'];
  if (/\b(restaurant|diner|eatery|bistro|grill)\b/.test(w)) return ['["amenity"="restaurant"]'];
  if (/\b(cafe|coffee|bakery|bakeries)\b/.test(w)) return ['["amenity"="cafe"]', '["shop"="bakery"]'];
  if (/\b(bar|pub|brewery|tavern)\b/.test(w)) return ['["amenity"="bar"]', '["amenity"="pub"]'];
  if (/\b(salon|barber|hair|beauty|nail|spa)\b/.test(w)) return ['["shop"="hairdresser"]', '["shop"="beauty"]', '["leisure"="spa"]'];
  if (/\b(gym|fitness|crossfit|yoga|pilates)\b/.test(w)) return ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'];
  if (/\b(law|attorney|lawyer|legal)\b/.test(w)) return ['["office"="lawyer"]'];
  if (/\b(accountant|accounting|cpa|bookkeep|tax)\b/.test(w)) return ['["office"="accountant"]', '["office"="tax_advisor"]'];
  if (/\b(real ?estate|realtor|realty|property)\b/.test(w)) return ['["office"="estate_agent"]'];
  if (/\b(insurance)\b/.test(w)) return ['["office"="insurance"]'];
  if (/\b(plumb)/.test(w)) return ['["craft"="plumber"]', '["shop"="trade"]'];
  if (/\b(electric)/.test(w)) return ['["craft"="electrician"]'];
  if (/\b(hvac|heating|cooling|furnace|air ?condition)\b/.test(w)) return ['["craft"="hvac"]'];
  if (/\b(roof)/.test(w)) return ['["craft"="roofer"]'];
  if (/\b(landscap|lawn|garden|nursery|plant)\b/.test(w)) return ['["shop"="garden_centre"]', '["shop"="florist"]', '["landuse"="plant_nursery"]'];
  if (/\b(hotel|motel|inn|lodging)\b/.test(w)) return ['["tourism"="hotel"]', '["tourism"="motel"]'];
  if (/\b(store|shop|retail|boutique)\b/.test(w)) return ['["shop"]["name"]'];
  if (/\b(office|practice|firm|agency|company)\b/.test(w)) return ['["office"]["name"]', '["amenity"="clinic"]'];
  const word = w.split(/[^a-z0-9]+/).filter((p) => p.length > 3).sort((a, b) => b.length - a.length)[0] || w;
  const safe = word.replace(/[\\"]/g, '');
  return [`["name"~"${safe}",i]["shop"]`, `["name"~"${safe}",i]["office"]`, `["name"~"${safe}",i]["amenity"]`];
}

/** Nominatim gives boundingbox as [south, north, west, east] strings; Overpass wants (south,west,north,east). */
export function bboxParam(boundingbox) {
  if (!Array.isArray(boundingbox) || boundingbox.length < 4) return null;
  const [south, north, west, east] = boundingbox.map(Number);
  if ([south, north, west, east].some((n) => !Number.isFinite(n))) return null;
  return `(${south},${west},${north},${east})`;
}

/** Build the Overpass QL body: every filter, in the bounding box, with tags and centroids, capped. */
export function overpassBody(filters, bbox, cap) {
  const parts = filters.map((f) => `nwr${f}${bbox};`).join('');
  return `[out:json][timeout:25];(${parts});out tags center ${cap};`;
}

function addressOf(t) {
  const line = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const city = [t['addr:city'], t['addr:state'], t['addr:postcode']].filter(Boolean).join(', ');
  return [line, city].filter(Boolean).join(', ');
}

/**
 * Turn Overpass elements into our Place shape. Drops the unnamed and the disused, dedupes, and puts
 * the contactable (a phone or website) first, since outreach drops the rest anyway. Capped at `maxResults`.
 */
export function placesFromOverpass(elements, maxResults) {
  const out = [];
  const seen = new Set();
  for (const el of elements || []) {
    const t = el.tags || {};
    const name = t.name || t['name:en'] || t.brand;
    if (!name) continue;
    if (t.disused === 'yes' || t['disused:shop'] || t['disused:amenity']) continue;
    const placeId = `osm:${el.type}/${el.id}`;
    if (seen.has(placeId)) continue;
    seen.add(placeId);
    out.push({
      placeId,
      name,
      address: addressOf(t),
      phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
      website: t.website || t['contact:website'] || t.url || '',
      rating: null,
      reviews: null,
      operational: true,
    });
  }
  out.sort((a, b) => Number(Boolean(b.phone || b.website)) - Number(Boolean(a.phone || a.website)));
  return out.slice(0, maxResults);
}
