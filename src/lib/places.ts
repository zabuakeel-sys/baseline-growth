// Google Places text search: "independent auto repair shop in Detroit, MI" -> businesses.
// Needs GOOGLE_PLACES_API_KEY. Tries Places API (New) first; if the key is only enabled for the
// older Places API (a common case for keys made for other apps), it falls back to that automatically,
// so one key works either way. Each request is billed by Google; see their current pricing.
// PLACES_API_URL / PLACES_LEGACY_URL point at stand-in servers for tests.

export type Place = {
  placeId: string; name: string; address: string; phone: string; website: string;
  rating: number | null; reviews: number | null; operational: boolean;
};

type ApiPlace = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string;
  websiteUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string;
};

const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.businessStatus', 'nextPageToken',
].join(',');

export const placesConfigured = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

/** True when Google refused the key for this API (not enabled / not permitted), so the other API is worth a try. */
const isNotEnabled = (err: unknown) => /\b403\b|PERMISSION_DENIED|REQUEST_DENIED|SERVICE_DISABLED|not been used|disabled/i.test((err as Error).message);

/** Search, preferring Places API (New); on a "not enabled" refusal, retry with the older Places API. */
export async function searchPlaces(textQuery: string, maxResults: number): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set.');
  try {
    return await searchNew(textQuery, maxResults, key);
  } catch (err) {
    if (!isNotEnabled(err)) throw err;
    try {
      return await searchLegacy(textQuery, maxResults, key);
    } catch (legacyErr) {
      // Neither API accepted the key: report both so the fix is clear.
      if (isNotEnabled(legacyErr)) {
        throw new Error('Google refused this key for both Places APIs. In Google Cloud, enable "Places API (New)" for the key (APIs & Services, Library), or allow it under the key\'s API restrictions.');
      }
      throw legacyErr;
    }
  }
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
      throw new Error(`Google Places returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
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
