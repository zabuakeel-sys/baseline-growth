// Google Places API (New) text search: "independent auto repair shop in Detroit, MI" -> businesses.
// Needs GOOGLE_PLACES_API_KEY. Each page is billed by Google; see their current pricing.
// PLACES_API_URL can point at a stand-in server for tests.

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

export async function searchPlaces(textQuery: string, maxResults: number): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set.');
  const url = process.env.PLACES_API_URL || 'https://places.googleapis.com/v1/places:searchText';
  const out: Place[] = [];
  let pageToken: string | undefined;
  // Google returns at most 20 per page and 60 in all.
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
