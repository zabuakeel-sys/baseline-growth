// Ordering visit stops into the shortest practical driving route, by greedy nearest-neighbor from
// where the rep is now. Pure (no network), so the ordering is unit-tested. Great-circle distance is
// a good enough proxy for "which stop is closest next" within a metro.

const EARTH_KM = 6371;

const hasCoords = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Kilometres between two { lat, lng } points. */
export function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Order `stops` (each { lat, lng, ... }) into a nearest-neighbor route from `origin`. Stops with no
 * usable coordinates keep their original order at the end (so they are not dropped). Returns a new
 * array; does not mutate the input.
 */
export function orderByNearest(origin, stops) {
  const located = stops.filter(hasCoords);
  const rest = stops.filter((s) => !hasCoords(s));
  if (located.length <= 1) return [...located, ...rest];

  const pool = [...located];
  const ordered = [];
  // Start from the stop nearest the rep; if we have no location, start from the first stop.
  let current = hasCoords(origin) ? origin : pool[0];
  while (pool.length) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = haversine(current, pool[i]);
      if (d < bestDist) { bestDist = d; bestIndex = i; }
    }
    current = pool.splice(bestIndex, 1)[0];
    ordered.push(current);
  }
  return [...ordered, ...rest];
}
