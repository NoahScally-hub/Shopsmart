import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db, { normalizeItemName } from "../db";
import { useSettings } from "../settings";
import type { Store } from "../types";

interface StorePlan {
  store: Store;
  covered: number;
  missing: number;
  itemsCost: number;
  travelCost: number;
  total: number;
}

export default function PlanView() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const lists = useLiveQuery(() => db.lists.toArray(), []);
  const [chosenListId, setChosenListId] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [tripMsg, setTripMsg] = useState("");

  const listId =
    chosenListId ??
    lists?.find((l) => l.isDefault)?.id ??
    lists?.[0]?.id ??
    null;

  const items = useLiveQuery(
    async () =>
      listId == null
        ? []
        : (await db.items.where("listId").equals(listId).toArray()).filter(
            (i) => !i.checked
          ),
    [listId]
  );
  const stores = useLiveQuery(() => db.stores.orderBy("name").toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);

  if (!lists || !items || !stores || !prices) return null;

  const priceMap = new Map<string, number>();
  for (const p of prices) priceMap.set(`${p.itemName}|${p.storeId}`, p.price);

  const travelCostOf = (s: Store) =>
    ((s.distanceKm * 2) / 100) * settings.fuelLper100km * settings.gasPricePerL;

  const included = stores.filter((s) => !excluded.has(s.id!));

  const plans: StorePlan[] = included
    .map((store) => {
      let covered = 0;
      let itemsCost = 0;
      for (const it of items) {
        const p = priceMap.get(`${normalizeItemName(it.name)}|${store.id}`);
        if (p != null) {
          covered++;
          itemsCost += p * it.qty;
        }
      }
      const travelCost = travelCostOf(store);
      return {
        store,
        covered,
        missing: items.length - covered,
        itemsCost,
        travelCost,
        total: itemsCost + travelCost
      };
    })
    .filter((p) => p.covered > 0)
    .sort((a, b) => a.missing - b.missing || a.total - b.total);

  const best = plans[0];

  // Multi-stop: cheapest store per item; pay travel for every store visited.
  let multi: { stops: Store[]; itemsCost: number; travelCost: number; total: number; covered: number } | null =
    null;
  if (included.length > 1 && items.length > 0) {
    const stopIds = new Set<number>();
    let itemsCost = 0;
    let covered = 0;
    for (const it of items) {
      let bestPrice: number | null = null;
      let bestStore: number | null = null;
      for (const s of included) {
        const p = priceMap.get(`${normalizeItemName(it.name)}|${s.id}`);
        if (p != null && (bestPrice == null || p < bestPrice)) {
          bestPrice = p;
          bestStore = s.id!;
        }
      }
      if (bestPrice != null && bestStore != null) {
        covered++;
        itemsCost += bestPrice * it.qty;
        stopIds.add(bestStore);
      }
    }
    if (stopIds.size > 1) {
      const stops = included.filter((s) => stopIds.has(s.id!));
      const travelCost = stops.reduce((sum, s) => sum + travelCostOf(s), 0);
      multi = { stops, itemsCost, travelCost, total: itemsCost + travelCost, covered };
    }
  }

  const toggleExclude = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const recordTrip = async (plan: StorePlan) => {
    await db.trips.add({
      date: Date.now(),
      storeId: plan.store.id!,
      total: plan.total,
      itemCount: plan.covered
    });
    setTripMsg(t("plan.tripRecorded", { store: plan.store.name }));
    setTimeout(() => setTripMsg(""), 3000);
  };

  const money = (v: number) => `${settings.currency}${v.toFixed(2)}`;

  return (
    <section>
      <h2>{t("plan.title")}</h2>
      <div className="row">
        <label>{t("plan.chooseList")}</label>
        <select
          value={listId ?? ""}
          onChange={(e) => setChosenListId(Number(e.target.value))}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {stores.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {stores.map((s) => (
            <label key={s.id} className="row" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={!excluded.has(s.id!)}
                onChange={() => toggleExclude(s.id!)}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}

      {tripMsg && <p className="pill">{tripMsg}</p>}

      {(items.length === 0 || plans.length === 0) && (
        <p className="muted">{t("plan.noData")}</p>
      )}

      <ul className="cards">
        {multi && (
          <li className={!best || multi.total < best.total ? "card best" : "card"}>
            <div className="row spread">
              <strong>
                {t("plan.multiStop")} ({multi.stops.map((s) => s.name).join(" + ")})
              </strong>
              {(!best || multi.total < best.total) && (
                <span className="pill">{t("plan.bestValue")}</span>
              )}
            </div>
            <div className="plan-line">
              <span>{t("plan.itemsCost")}</span>
              <span>{money(multi.itemsCost)}</span>
            </div>
            <div className="plan-line">
              <span>{t("plan.travelCost")}</span>
              <span>{money(multi.travelCost)}</span>
            </div>
            <div className="plan-line plan-total">
              <span>{t("plan.total")}</span>
              <span>{money(multi.total)}</span>
            </div>
            <p className="muted">{t("plan.multiStopHint")}</p>
          </li>
        )}
        {plans.map((p, idx) => (
          <li
            key={p.store.id}
            className={
              idx === 0 && (!multi || p.total <= multi.total) ? "card best" : "card"
            }
          >
            <div className="row spread">
              <strong>{p.store.name}</strong>
              {idx === 0 && (!multi || p.total <= multi.total) && (
                <span className="pill">{t("plan.bestValue")}</span>
              )}
            </div>
            <div className="plan-line">
              <span>
                {t("plan.itemsCost")} ({p.covered}/{items.length})
              </span>
              <span>{money(p.itemsCost)}</span>
            </div>
            <div className="plan-line">
              <span>
                {t("plan.travelCost")} ({p.store.distanceKm * 2} km)
              </span>
              <span>{money(p.travelCost)}</span>
            </div>
            <div className="plan-line plan-total">
              <span>{t("plan.total")}</span>
              <span>{money(p.total)}</span>
            </div>
            {p.missing > 0 && (
              <p className="muted">{t("plan.missing", { count: p.missing })}</p>
            )}
            <button onClick={() => recordTrip(p)}>{t("plan.recordTrip")}</button>
          </li>
        ))}
      </ul>

      {plans.length > 0 && <p className="muted">{t("plan.gasNote")}</p>}
    </section>
  );
}
