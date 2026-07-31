import { describe, expect, it } from "vitest";
import {
  monthlySpend,
  priceTrends,
  saleStats,
  storeTotals,
  tripSummary
} from "../insights";
import type { PriceEntry, Store, Trip } from "../types";

const NOW = new Date(2026, 6, 15); // 15 Jul 2026

const trip = (date: Date, storeId: number, total: number): Trip => ({
  date: date.getTime(),
  storeId,
  total,
  itemCount: 1
});

const store = (id: number, name: string): Store => ({ id, name, distanceKm: 1 });

const price = (itemName: string, onSale: 0 | 1): PriceEntry => ({
  itemName,
  storeId: 1,
  price: 1,
  onSale,
  updatedAt: 0
});

describe("monthlySpend", () => {
  it("returns consecutive months ending with the current one", () => {
    const buckets = monthlySpend([], 6, NOW);
    expect(buckets).toHaveLength(6);
    expect(buckets.at(-1)).toMatchObject({ year: 2026, month: 6 });
    expect(buckets.at(0)).toMatchObject({ year: 2026, month: 1 });
  });

  it("crosses a year boundary correctly", () => {
    const buckets = monthlySpend([], 3, new Date(2026, 1, 10)); // Feb 2026
    expect(buckets.map((b) => [b.year, b.month])).toEqual([
      [2025, 11],
      [2026, 0],
      [2026, 1]
    ]);
  });

  it("sums trips into their month and counts them", () => {
    const buckets = monthlySpend(
      [
        trip(new Date(2026, 6, 2), 1, 10),
        trip(new Date(2026, 6, 20), 1, 5),
        trip(new Date(2026, 5, 3), 1, 7)
      ],
      6,
      NOW
    );
    expect(buckets.at(-1)).toMatchObject({ total: 15, trips: 2 });
    expect(buckets.at(-2)).toMatchObject({ total: 7, trips: 1 });
  });

  it("leaves months with no trips at zero rather than dropping them", () => {
    const buckets = monthlySpend([trip(new Date(2026, 6, 2), 1, 10)], 3, NOW);
    expect(buckets.map((b) => b.total)).toEqual([0, 0, 10]);
  });

  it("ignores trips older than the window", () => {
    const buckets = monthlySpend([trip(new Date(2024, 0, 1), 1, 99)], 6, NOW);
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });
});

describe("storeTotals", () => {
  const stores = [store(1, "Near"), store(2, "Far")];

  it("aggregates spend and trip count per store, biggest first", () => {
    const rows = storeTotals(
      [
        trip(NOW, 1, 10),
        trip(NOW, 1, 5),
        trip(NOW, 2, 30)
      ],
      stores
    );
    expect(rows).toEqual([
      { storeId: 2, name: "Far", trips: 1, total: 30 },
      { storeId: 1, name: "Near", trips: 2, total: 15 }
    ]);
  });

  it("omits stores with no trips", () => {
    expect(storeTotals([trip(NOW, 1, 4)], stores).map((r) => r.name)).toEqual([
      "Near"
    ]);
  });

  it("survives a trip whose store was deleted", () => {
    const rows = storeTotals([trip(NOW, 99, 4)], stores);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("");
  });

  it("returns nothing with no trips", () => {
    expect(storeTotals([], stores)).toEqual([]);
  });
});

describe("tripSummary", () => {
  it("totals and averages", () => {
    expect(tripSummary([trip(NOW, 1, 10), trip(NOW, 1, 20)])).toEqual({
      trips: 2,
      total: 30,
      average: 15
    });
  });

  it("does not divide by zero", () => {
    expect(tripSummary([])).toEqual({ trips: 0, total: 0, average: 0 });
  });
});

describe("saleStats", () => {
  it("counts the share on sale", () => {
    expect(saleStats([price("a", 1), price("b", 0), price("c", 0), price("d", 1)]))
      .toEqual({ tracked: 4, onSale: 2, ratio: 0.5 });
  });

  it("is zero, not NaN, with nothing tracked", () => {
    expect(saleStats([])).toEqual({ tracked: 0, onSale: 0, ratio: 0 });
  });
});

describe("priceTrends", () => {
  const obs = (item: string, price: number, iso: string) => ({
    item_name: item,
    price,
    observed_at: iso
  });

  it("reduces history to lowest, highest and most recent per item", () => {
    const rows = priceTrends([
      obs("milk", 3.0, "2026-01-01T00:00:00Z"),
      obs("milk", 4.5, "2026-03-01T00:00:00Z"),
      obs("milk", 3.8, "2026-02-01T00:00:00Z")
    ]);
    expect(rows).toEqual([
      { itemName: "milk", lowest: 3.0, highest: 4.5, latest: 4.5, observations: 3 }
    ]);
  });

  it("picks latest by observation date, not array order", () => {
    const rows = priceTrends([
      obs("milk", 9, "2026-05-01T00:00:00Z"),
      obs("milk", 2, "2026-01-01T00:00:00Z")
    ]);
    expect(rows[0].latest).toBe(9);
  });

  it("drops items seen only once, since they show no movement", () => {
    const rows = priceTrends([
      obs("milk", 3, "2026-01-01T00:00:00Z"),
      obs("bread", 2, "2026-01-01T00:00:00Z"),
      obs("bread", 2.5, "2026-02-01T00:00:00Z")
    ]);
    expect(rows.map((r) => r.itemName)).toEqual(["bread"]);
  });

  it("ignores rows with an unusable price", () => {
    const rows = priceTrends([
      obs("milk", Number.NaN, "2026-01-01T00:00:00Z"),
      obs("milk", 3, "2026-02-01T00:00:00Z"),
      obs("milk", 4, "2026-03-01T00:00:00Z")
    ]);
    expect(rows[0].observations).toBe(2);
  });

  it("caps the number of rows returned", () => {
    const history = [];
    for (let i = 0; i < 12; i++) {
      history.push(obs(`item${i}`, 1, "2026-01-01T00:00:00Z"));
      history.push(obs(`item${i}`, 2, "2026-02-01T00:00:00Z"));
    }
    expect(priceTrends(history, 5)).toHaveLength(5);
  });

  it("returns nothing for empty history", () => {
    expect(priceTrends([])).toEqual([]);
  });
});
