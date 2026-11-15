// Business search: "independent auto repair shop in Detroit, MI" -> businesses.
// Prefers Google Places when GOOGLE_PLACES_API_KEY is set: Places API (New) first, then the older
// Places API if the key is only enabled for that one. If Google is not enabled or over its daily
// quota on both, or there is no Google key at all, it falls back to OpenStreetMap, which is free and
// needs no key or billing (see osm.ts). So search works even with no paid Google account.
// PLACES_API_URL / PLACES_LEGACY_URL point at stand-in servers for tests.

export type Place = {
  placeId: string; name: string; address: string; phone: string; website: string;
  rating: number | null; reviews: number | null; operational: boolean;
  lat?: number | null; lng?: number | null;
};

type ApiPlace = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string;
  websiteUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
};

const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.businessStatus', 'places.location', 'nextPageToken',
].join(',');

// Search is always available now: with no Google key it uses the free OpenStreetMap source.
export const placesConfigured = () => true;
/** True only when a Google Places key is set, so we try Google before the free source. */
export const googleConfigured = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

/** True when Google refused the key for this API (not enabled / not permitted), so the other API is worth a try. */
const isNotEnabled = (err: unknown) => /\b403\b|PERMISSION_DENIED|REQUEST_DENIED|SERVICE_DISABLED|not been used|disabled/i.test((err as Error).message);
/** True when the new API is over its (often tiny) daily quota, so the older API's quota is worth a try. */
const isQuota = (err: unknown) => /\b429\b|RESOURCE_EXHAUSTED|Quota exceeded|OVER_QUERY_LIMIT|rateLimitExceeded/i.test((err as Error).message);

/**
 * Search, preferring Google Places (New), then the older Places API, then the free OpenStreetMap
 * source. Google needs a key with billing; when it is not enabled or over its daily quota on both
 * APIs, or there is no key at all, OpenStreetMap takes over so prospects still come in.
 */
export async function searchPlaces(textQuery: string, maxResults: number): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  // No Google key: go straight to the free source.
  if (!key) return searchFree(textQuery, maxResults);
  try {
    return await searchNew(textQuery, maxResults, key);
  } catch (err) {
    if (!isNotEnabled(err) && !isQuota(err)) throw err;
    try {
      return await searchLegacy(textQuery, maxResults, key);
    } catch (legacyErr) {
      // Google is blocked or over quota on both APIs: use OpenStreetMap instead of failing.
      if (isNotEnabled(legacyErr) || isQuota(legacyErr)) return searchFree(textQuery, maxResults);
      throw legacyErr;
    }
  }
}

/** The free OpenStreetMap source (no key, no billing). */
async function searchFree(textQuery: string, maxResults: number): Promise<Place[]> {
  const { searchOSM } = await import('./osm');
  return searchOSM(textQuery, maxResults);
}

/** Places API (New): POST text search, up to 60 results across 3 pages. */
async function searchNew(textQuery: string, maxResults: number, key: string): Promise<Place[]> {
  const url = process.env.PLACES_API_URL || 'https://places.googleapis.com/v1/places:searchText';
  const out: Place[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3 && out.length < maxResults; page++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery, pageSize: Math.min(20, maxResults - out.length), ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Pull the useful bits out of a quota error so the cause is obvious: which project and limit.
      let extra = '';
      try {
        const j = JSON.parse(detail) as { error?: { message?: string; details?: { metadata?: Record<string, string> }[] } };
        const meta = j.error?.details?.map((d) => d.metadata).find((m) => m && (m.consumer || m.quota_limit_value));
        if (meta) extra = ` [project ${meta.consumer ?? '?'}, daily limit ${meta.quota_limit_value ?? '?'}]`;
      } catch { /* not JSON */ }
      throw new Error(`Google Places returned ${res.status}${extra}${detail ? `: ${detail.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
    }
    const data = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
    for (const p of data.places ?? []) {
      out.push({
        placeId: p.id,
        name: p.displayName?.text ?? 'Unnamed business',
        address: p.formattedAddress ?? '',
        phone: p.nationalPhoneNumber ?? '',
        website: p.websiteUri ?? '',
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        operational: (p.businessStatus ?? 'OPERATIONAL') === 'OPERATIONAL',
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, maxResults);
}

type LegacyResult = { place_id: string; name?: string; formatted_address?: string; rating?: number; user_ratings_total?: number; business_status?: string };

/**
 * Older Places API: one text search (first page, up to 20), then a details lookup per result for
 * the phone and website. Used only when the key is not enabled for Places API (New).
 */
async function searchLegacy(textQuery: string, maxResults: number, key: string): Promise<Place[]> {
  const base = (process.env.PLACES_LEGACY_URL || 'https://maps.googleapis.com/maps/api/place').replace(/\/$/, '');
  const searchRes = await fetch(`${base}/textsearch/json?query=${encodeURIComponent(textQuery)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  const data = (await searchRes.json().catch(() => ({}))) as { results?: LegacyResult[]; status?: string; error_message?: string };
  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places (legacy) ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`);
  }
  const results = (data.results ?? []).slice(0, Math.min(20, maxResults));
  const out: Place[] = [];
  for (const r of results) {
    let phone = '';
    let website = '';
    try {
      const dRes = await fetch(`${base}/details/json?place_id=${encodeURIComponent(r.place_id)}&fields=formatted_phone_number,website&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
      const d = (await dRes.json().catch(() => ({}))) as { result?: { formatted_phone_number?: string; website?: string } };
      phone = d.result?.formatted_phone_number ?? '';
      website = d.result?.website ?? '';
    } catch { /* keep the business without contact details rather than fail the whole search */ }
    out.push({
      placeId: r.place_id,
      name: r.name ?? 'Unnamed business',
      address: r.formatted_address ?? '',
      phone,
      website,
      rating: r.rating ?? null,
      reviews: r.user_ratings_total ?? null,
      operational: (r.business_status ?? 'OPERATIONAL') === 'OPERATIONAL',
    });
  }
  return out;
}
