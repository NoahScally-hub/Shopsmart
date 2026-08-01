import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetThrottle,
  MIN_INTERVAL_MS,
  geocode,
  haversineKm,
  throttleDelay
} from "../geo";

// Reference points, distances from published great-circle figures.
const PARIS = { lat: 48.8566, lon: 2.3522 };
const LONDON = { lat: 51.5074, lon: -0.1278 };
const MONTREAL = { lat: 45.5019, lon: -73.5674 };

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it("matches the known Paris–London distance (~344 km)", () => {
    expect(haversineKm(PARIS, LONDON)).toBeCloseTo(344, 0);
  });

  it("matches the known Paris–Montreal distance (~5505 km)", () => {
    expect(haversineKm(PARIS, MONTREAL)).toBeCloseTo(5505, -1);
  });

  it("is symmetric", () => {
    expect(haversineKm(PARIS, LONDON)).toBeCloseTo(haversineKm(LONDON, PARIS), 9);
  });

  // 20° of latitude plus 2° of longitude near the equator; hand-computed as
  // 2234.9 km, which also confirms the 2° gap is measured across the
  // antimeridian rather than the long way round (which would be ~358°).
  it("handles crossing the equator and the antimeridian", () => {
    expect(haversineKm({ lat: -10, lon: 179 }, { lat: 10, lon: -179 })).toBeCloseTo(
      2235,
      -1
    );
  });

  it("gives a small, sane number for a short city hop", () => {
    const km = haversineKm(MONTREAL, { lat: 45.5088, lon: -73.5878 });
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(3);
  });
});

describe("throttleDelay", () => {
  it("allows the first request immediately", () => {
    expect(throttleDelay(0, 1_000_000)).toBe(0);
  });

  it("makes a back-to-back request wait out the interval", () => {
    const now = 1_000_000;
    expect(throttleDelay(now, now)).toBe(MIN_INTERVAL_MS);
  });

  it("allows a request once the interval has passed", () => {
    const now = 1_000_000;
    expect(throttleDelay(now - MIN_INTERVAL_MS, now)).toBe(0);
  });

  it("enforces at most one request per second", () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe("geocode", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    __resetThrottle();
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const mockFetch = (payload: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => payload
    });

  const HIT = [
    { lat: "45.5019", lon: "-73.5674", display_name: "Somewhere, Montreal" }
  ];

  it("returns the first result", async () => {
    vi.stubGlobal("fetch", mockFetch(HIT));
    const r = await geocode("123 Main St");
    expect(r).toEqual({
      lat: 45.5019,
      lon: -73.5674,
      displayName: "Somewhere, Montreal"
    });
  });

  it("caches a hit so the same query is not re-requested", async () => {
    const fetchSpy = mockFetch(HIT);
    vi.stubGlobal("fetch", fetchSpy);
    await geocode("123 Main St");
    await geocode("  123 MAIN ST  "); // same after normalizing
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches a miss so a bad address is not retried", async () => {
    const fetchSpy = mockFetch([]);
    vi.stubGlobal("fetch", fetchSpy);
    expect(await geocode("nowhere at all")).toBeNull();
    expect(await geocode("nowhere at all")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call the network for an empty query", async () => {
    const fetchSpy = mockFetch(HIT);
    vi.stubGlobal("fetch", fetchSpy);
    expect(await geocode("   ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on an HTTP error rather than returning a wrong location", async () => {
    vi.stubGlobal("fetch", mockFetch(null, false, 429));
    await expect(geocode("rate limited")).rejects.toThrow("geocode-http-429");
  });

  it("sends the query encoded, to the documented endpoint", async () => {
    const fetchSpy = mockFetch(HIT);
    vi.stubGlobal("fetch", fetchSpy);
    await geocode("Café & Bar, Montréal");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("format=jsonv2");
    expect(url).toContain(encodeURIComponent("Café & Bar, Montréal"));
  });
});
