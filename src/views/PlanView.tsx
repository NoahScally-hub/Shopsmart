import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { useSettings } from "../settings";
import {
  buildPriceMap,
  computeMultiStop,
  computeStorePlans,
  type StorePlan
} from "../plan";

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

  const priceMap = buildPriceMap(prices);
  const included = stores.filter((s) => !excluded.has(s.id!));

  const plans = computeStorePlans(items, included, priceMap, settings);
  const best = plans[0];
  const multi = computeMultiStop(items, included, priceMap, settings);

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
