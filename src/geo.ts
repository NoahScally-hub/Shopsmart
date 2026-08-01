export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeocodeResult extends LatLon {
  displayName: string;
}

/** Nominatim's usage policy caps clients at one request per second. */
export const MIN_INTERVAL_MS = 1100;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_KEY = "shopsmart-geocode-cache";

/** Great-circle distance in km. Good enough for ranking nearby stores —
 *  we deliberately don't do road routing (see docs/PLAN.md phase 6). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How long to wait before the next request is allowed. Pure so the
 *  throttle can be tested without timers. */
export function throttleDelay(lastRequestAt: number, now: number): number {
  return Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
}

type CacheShape = Record<string, GeocodeResult | null>;

function readCache(): CacheShape {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as CacheShape;
  } catch {
    return {};
  }
}

function writeCache(key: string, value: GeocodeResult | null) {
  try {
    const cache = readCache();
    cache[key] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A full or unavailable localStorage must not break geocoding.
  }
}

let lastRequestAt = 0;

/** Reset the throttle between tests. Not used by app code. */
export function __resetThrottle() {
  lastRequestAt = 0;
}

/**
 * Look up an address with OpenStreetMap's Nominatim.
 *
 * Respects their usage policy: results are cached (including misses, so a bad
 * address isn't retried), and requests are throttled to one per second. The
 * policy also asks clients to identify themselves — browsers forbid setting
 * User-Agent from fetch, but they send Referer automatically, which Nominatim
 * accepts as identification for browser apps.
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;

  const cache = readCache();
  if (key in cache) return cache[key];

  const wait = throttleDelay(lastRequestAt, Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`geocode-http-${res.status}`);

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  const first = data?.[0];
  const result: GeocodeResult | null = first
    ? {
        lat: Number(first.lat),
        lon: Number(first.lon),
        displayName: String(first.display_name)
      }
    : null;

  writeCache(key, result);
  return result;
}

/** Browser Geolocation, promise-shaped. Requires user permission. */
export function currentPosition(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation-unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.message || "geolocation-denied")),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  });
}
