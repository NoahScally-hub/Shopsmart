import { describe, expect, it } from "vitest";
import {
  buildPriceMap,
  computeMultiStop,
  computeStorePlans,
  travelCost,
  type PlanSettings
} from "../plan";
import type { ListItem, Store } from "../types";

const settings: PlanSettings = { fuelLper100km: 8, gasPricePerL: 1.6 };

const store = (id: number, name: string, distanceKm: number): Store => ({
  id,
  name,
  distanceKm
});

const item = (name: string, qty = 1): ListItem => ({
  listId: 1,
  name,
  qty,
  unit: "",
  checked: 0,
  createdAt: 0
});

// 5 km each way -> 10 km round trip -> 0.8 L -> $1.28
const NEAR = store(1, "Near", 5);
const FAR = store(2, "Far", 20);

describe("travelCost", () => {
  it("charges the round trip", () => {
    expect(travelCost(5, 8, 1.6)).toBeCloseTo(1.28, 5);
  });

  it("is zero at zero distance", () => {
    expect(travelCost(0, 8, 1.6)).toBe(0);
  });

  it("scales linearly with distance", () => {
    expect(travelCost(10, 8, 1.6)).toBeCloseTo(2.56, 5);
  });
});

describe("computeStorePlans", () => {
  it("multiplies unit price by quantity and adds travel", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 3 }
    ]);
    const [plan] = computeStorePlans([item("Milk", 2)], [NEAR], prices, settings);
    expect(plan.itemsCost).toBe(6);
    expect(plan.travelCost).toBeCloseTo(1.28, 5);
    expect(plan.total).toBeCloseTo(7.28, 5);
  });

  it("matches item names case-insensitively and ignoring surrounding space", () => {
    const prices = buildPriceMap([{ itemName: "milk", storeId: 1, price: 3 }]);
    const [plan] = computeStorePlans([item("  MiLk ")], [NEAR], prices, settings);
    expect(plan.covered).toBe(1);
  });

  it("counts items it has no price for as missing", () => {
    const prices = buildPriceMap([{ itemName: "milk", storeId: 1, price: 3 }]);
    const [plan] = computeStorePlans(
      [item("Milk"), item("Bread")],
      [NEAR],
      prices,
      settings
    );
    expect(plan.covered).toBe(1);
    expect(plan.missing).toBe(1);
  });

  it("omits stores that supply nothing", () => {
    const prices = buildPriceMap([{ itemName: "milk", storeId: 1, price: 3 }]);
    const plans = computeStorePlans([item("Milk")], [NEAR, FAR], prices, settings);
    expect(plans.map((p) => p.store.name)).toEqual(["Near"]);
  });

  it("prefers fewer missing items over a lower total", () => {
    // Far covers both items but costs far more; Near covers only one.
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 1 },
      { itemName: "milk", storeId: 2, price: 50 },
      { itemName: "bread", storeId: 2, price: 50 }
    ]);
    const plans = computeStorePlans(
      [item("Milk"), item("Bread")],
      [NEAR, FAR],
      prices,
      settings
    );
    expect(plans[0].store.name).toBe("Far");
    expect(plans[0].missing).toBe(0);
  });

  it("breaks ties on equal coverage by total cost", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 4 },
      { itemName: "milk", storeId: 2, price: 3 }
    ]);
    const plans = computeStorePlans([item("Milk")], [NEAR, FAR], prices, settings);
    // Far's cheaper item cannot make up for its much longer drive.
    expect(plans[0].store.name).toBe("Near");
  });

  it("returns nothing when there are no prices at all", () => {
    expect(computeStorePlans([item("Milk")], [NEAR], buildPriceMap([]), settings))
      .toEqual([]);
  });
});

describe("computeMultiStop", () => {
  it("buys each item at its cheapest store and pays travel per stop", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 3 },
      { itemName: "milk", storeId: 2, price: 9 },
      { itemName: "bread", storeId: 1, price: 9 },
      { itemName: "bread", storeId: 2, price: 2 }
    ]);
    const multi = computeMultiStop(
      [item("Milk"), item("Bread")],
      [NEAR, FAR],
      prices,
      settings
    );
    expect(multi).not.toBeNull();
    expect(multi!.itemsCost).toBe(5);
    expect(multi!.covered).toBe(2);
    expect(multi!.stops.map((s) => s.name)).toEqual(["Near", "Far"]);
    // 1.28 (Near) + 5.12 (Far)
    expect(multi!.travelCost).toBeCloseTo(6.4, 5);
    expect(multi!.total).toBeCloseTo(11.4, 5);
  });

  it("is null when one store is cheapest for everything", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 1 },
      { itemName: "bread", storeId: 1, price: 1 },
      { itemName: "milk", storeId: 2, price: 5 }
    ]);
    expect(
      computeMultiStop([item("Milk"), item("Bread")], [NEAR, FAR], prices, settings)
    ).toBeNull();
  });

  it("is null with fewer than two stores or no items", () => {
    const prices = buildPriceMap([{ itemName: "milk", storeId: 1, price: 1 }]);
    expect(computeMultiStop([item("Milk")], [NEAR], prices, settings)).toBeNull();
    expect(computeMultiStop([], [NEAR, FAR], prices, settings)).toBeNull();
  });

  it("respects quantities when picking the cheapest store", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 3 },
      { itemName: "bread", storeId: 2, price: 2 }
    ]);
    const multi = computeMultiStop(
      [item("Milk", 2), item("Bread", 3)],
      [NEAR, FAR],
      prices,
      settings
    );
    expect(multi!.itemsCost).toBe(12);
  });
});

describe("excluding stores", () => {
  it("changes the ranking when the caller filters a store out", () => {
    const prices = buildPriceMap([
      { itemName: "milk", storeId: 1, price: 10 },
      { itemName: "milk", storeId: 2, price: 1 }
    ]);
    const withBoth = computeStorePlans([item("Milk")], [NEAR, FAR], prices, settings);
    expect(withBoth).toHaveLength(2);

    const nearExcluded = computeStorePlans([item("Milk")], [FAR], prices, settings);
    expect(nearExcluded.map((p) => p.store.name)).toEqual(["Far"]);
  });
});
