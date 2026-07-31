import { normalizeItemName } from "./db";
import type { ListItem, Store } from "./types";

export interface StorePlan {
  store: Store;
  covered: number;
  missing: number;
  itemsCost: number;
  travelCost: number;
  total: number;
}

export interface MultiStopPlan {
  stops: Store[];
  covered: number;
  itemsCost: number;
  travelCost: number;
  total: number;
}

/** Only the settings fields the plan math needs, so tests don't build a whole
 *  Settings object and the functions stay honest about their inputs. */
export interface PlanSettings {
  fuelLper100km: number;
  gasPricePerL: number;
}

/** Keyed `${normalizedItemName}|${storeId}` -> unit price. */
export type PriceMap = Map<string, number>;

export function buildPriceMap(
  prices: Array<{ itemName: string; storeId: number; price: number }>
): PriceMap {
  const map: PriceMap = new Map();
  for (const p of prices) map.set(`${p.itemName}|${p.storeId}`, p.price);
  return map;
}

/** Round trip: distance is paid twice. */
export function travelCost(
  distanceKm: number,
  fuelLper100km: number,
  gasPricePerL: number
): number {
  return ((distanceKm * 2) / 100) * fuelLper100km * gasPricePerL;
}

const priceOf = (map: PriceMap, item: ListItem, storeId: number | undefined) =>
  map.get(`${normalizeItemName(item.name)}|${storeId}`);

/** One plan per store that can supply at least one item, cheapest-and-most
 *  complete first: fewest missing items, then lowest total. */
export function computeStorePlans(
  items: ListItem[],
  stores: Store[],
  priceMap: PriceMap,
  settings: PlanSettings
): StorePlan[] {
  return stores
    .map((store) => {
      let covered = 0;
      let itemsCost = 0;
      for (const item of items) {
        const price = priceOf(priceMap, item, store.id);
        if (price != null) {
          covered++;
          itemsCost += price * item.qty;
        }
      }
      const travel = travelCost(
        store.distanceKm,
        settings.fuelLper100km,
        settings.gasPricePerL
      );
      return {
        store,
        covered,
        missing: items.length - covered,
        itemsCost,
        travelCost: travel,
        total: itemsCost + travel
      };
    })
    .filter((plan) => plan.covered > 0)
    .sort((a, b) => a.missing - b.missing || a.total - b.total);
}

/** Buy each item wherever it is cheapest, paying travel once per store
 *  actually visited. Null unless the result genuinely needs two or more
 *  stops — otherwise it would just duplicate a single-store plan. */
export function computeMultiStop(
  items: ListItem[],
  stores: Store[],
  priceMap: PriceMap,
  settings: PlanSettings
): MultiStopPlan | null {
  if (stores.length < 2 || items.length === 0) return null;

  const stopIds = new Set<number>();
  let itemsCost = 0;
  let covered = 0;

  for (const item of items) {
    let bestPrice: number | null = null;
    let bestStoreId: number | null = null;
    for (const store of stores) {
      const price = priceOf(priceMap, item, store.id);
      if (price != null && (bestPrice == null || price < bestPrice)) {
        bestPrice = price;
        bestStoreId = store.id!;
      }
    }
    if (bestPrice != null && bestStoreId != null) {
      covered++;
      itemsCost += bestPrice * item.qty;
      stopIds.add(bestStoreId);
    }
  }

  if (stopIds.size < 2) return null;

  const stops = stores.filter((s) => stopIds.has(s.id!));
  const travel = stops.reduce(
    (sum, s) =>
      sum + travelCost(s.distanceKm, settings.fuelLper100km, settings.gasPricePerL),
    0
  );
  return {
    stops,
    covered,
    itemsCost,
    travelCost: travel,
    total: itemsCost + travel
  };
}
