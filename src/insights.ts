import type { PriceEntry, Store, Trip } from "./types";

export interface MonthBucket {
  year: number;
  /** 0-indexed, as Date.getMonth() returns. */
  month: number;
  total: number;
  trips: number;
}

export interface StoreTotal {
  storeId: number;
  name: string;
  trips: number;
  total: number;
}

export interface TripSummary {
  trips: number;
  total: number;
  average: number;
}

export interface SaleStats {
  tracked: number;
  onSale: number;
  ratio: number;
}

/** Consecutive month buckets ending with the current month, so gaps in
 *  shopping history show as empty columns rather than being collapsed. */
export function monthlySpend(
  trips: Trip[],
  monthCount = 6,
  now: Date = new Date()
): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), total: 0, trips: 0 });
  }
  const index = new Map(buckets.map((b, i) => [`${b.year}-${b.month}`, i]));
  for (const trip of trips) {
    const d = new Date(trip.date);
    const at = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (at == null) continue; // older than the window
    buckets[at].total += trip.total;
    buckets[at].trips++;
  }
  return buckets;
}

/** Spend per store, biggest first. Stores never shopped at are omitted. */
export function storeTotals(trips: Trip[], stores: Store[]): StoreTotal[] {
  const nameById = new Map(stores.map((s) => [s.id!, s.name]));
  const acc = new Map<number, StoreTotal>();
  for (const trip of trips) {
    const row = acc.get(trip.storeId) ?? {
      storeId: trip.storeId,
      name: nameById.get(trip.storeId) ?? "",
      trips: 0,
      total: 0
    };
    row.trips++;
    row.total += trip.total;
    acc.set(trip.storeId, row);
  }
  return [...acc.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name)
  );
}

export function tripSummary(trips: Trip[]): TripSummary {
  const total = trips.reduce((sum, t) => sum + t.total, 0);
  return {
    trips: trips.length,
    total,
    average: trips.length ? total / trips.length : 0
  };
}

export function saleStats(prices: PriceEntry[]): SaleStats {
  const onSale = prices.reduce((n, p) => n + (p.onSale === 1 ? 1 : 0), 0);
  return {
    tracked: prices.length,
    onSale,
    ratio: prices.length ? onSale / prices.length : 0
  };
}

export interface PriceTrend {
  itemName: string;
  lowest: number;
  highest: number;
  latest: number;
  observations: number;
}

/** Collapse a price_history feed into one row per item. Rows need at least
 *  two observations to say anything about movement. */
export function priceTrends(
  history: Array<{ item_name: string; price: number; observed_at: string }>,
  limit = 8
): PriceTrend[] {
  const byItem = new Map<string, { prices: number[]; latest: number; at: number }>();
  for (const row of history) {
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    const at = new Date(row.observed_at).getTime();
    const cur = byItem.get(row.item_name);
    if (!cur) {
      byItem.set(row.item_name, { prices: [price], latest: price, at });
    } else {
      cur.prices.push(price);
      if (at >= cur.at) {
        cur.latest = price;
        cur.at = at;
      }
    }
  }
  return [...byItem.entries()]
    .map(([itemName, v]) => ({
      itemName,
      lowest: Math.min(...v.prices),
      highest: Math.max(...v.prices),
      latest: v.latest,
      observations: v.prices.length
    }))
    .filter((r) => r.observations > 1)
    .sort((a, b) => b.observations - a.observations || a.itemName.localeCompare(b.itemName))
    .slice(0, limit);
}
