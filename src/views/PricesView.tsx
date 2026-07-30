import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db, { normalizeItemName } from "../db";
import { useSettings } from "../settings";

export default function PricesView() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const stores = useLiveQuery(() => db.stores.orderBy("name").toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const listItems = useLiveQuery(() => db.items.toArray(), []);

  const [storeName, setStoreName] = useState("");
  const [storeDist, setStoreDist] = useState("");
  const [itemName, setItemName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  const [onSale, setOnSale] = useState(false);

  const addStore = async (e: FormEvent) => {
    e.preventDefault();
    const n = storeName.trim();
    if (!n) return;
    await db.stores.add({ name: n, distanceKm: Number(storeDist) || 0 });
    setStoreName("");
    setStoreDist("");
  };

  const removeStore = async (id: number, name: string) => {
    if (!confirm(t("common.confirmDelete", { name }))) return;
    await db.transaction("rw", db.stores, db.prices, async () => {
      await db.prices.where("storeId").equals(id).delete();
      await db.stores.delete(id);
    });
  };

  const addPrice = async (e: FormEvent) => {
    e.preventDefault();
    const norm = normalizeItemName(itemName);
    const sid = Number(storeId);
    const p = Number(price);
    if (!norm || !sid || !(p > 0)) return;
    const existing = await db.prices
      .where("[itemName+storeId]")
      .equals([norm, sid])
      .first();
    const entry = {
      itemName: norm,
      storeId: sid,
      price: p,
      onSale: (onSale ? 1 : 0) as 0 | 1,
      updatedAt: Date.now()
    };
    if (existing) await db.prices.update(existing.id!, entry);
    else await db.prices.add(entry);
    setItemName("");
    setPrice("");
    setOnSale(false);
  };

  const removePrice = (id: number) => db.prices.delete(id);

  const itemSuggestions = [
    ...new Set((listItems ?? []).map((i) => normalizeItemName(i.name)))
  ].sort();
  const priceNames = [...new Set((prices ?? []).map((p) => p.itemName))].sort();
  const priceMap = new Map<string, { id: number; price: number; onSale: 0 | 1 }>();
  for (const p of prices ?? [])
    priceMap.set(`${p.itemName}|${p.storeId}`, {
      id: p.id!,
      price: p.price,
      onSale: p.onSale
    });

  return (
    <section>
      <h2>{t("prices.storesTitle")}</h2>
      <form className="row" onSubmit={addStore}>
        <input
          className="grow"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder={t("prices.addStorePlaceholder")}
        />
        <input
          type="number"
          min="0"
          step="0.1"
          value={storeDist}
          onChange={(e) => setStoreDist(e.target.value)}
          placeholder={t("prices.distanceKm")}
        />
        <button className="primary" type="submit">
          {t("common.add")}
        </button>
      </form>
      <ul className="cards">
        {stores?.map((s) => (
          <li key={s.id} className="card row spread">
            <span className="grow">
              <strong>{s.name}</strong>{" "}
              <span className="muted">{s.distanceKm} km</span>
            </span>
            <button className="danger" onClick={() => removeStore(s.id!, s.name)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {stores?.length === 0 && <p className="muted">{t("prices.noStores")}</p>}

      {(stores?.length ?? 0) > 0 && (
        <>
          <h3>{t("prices.pricesTitle")}</h3>
          <form className="row" onSubmit={addPrice}>
            <input
              className="grow"
              list="item-suggestions"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder={t("prices.itemPlaceholder")}
            />
            <datalist id="item-suggestions">
              {itemSuggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">{t("common.store")}</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("common.price")}
            />
            <label className="row" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={onSale}
                onChange={(e) => setOnSale(e.target.checked)}
              />
              {t("prices.onSale")}
            </label>
            <button className="primary" type="submit">
              {t("common.save")}
            </button>
          </form>

          {priceNames.length > 0 && (
            <>
              <h3>{t("prices.compareTitle")}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("common.name")}</th>
                      {stores?.map((s) => (
                        <th key={s.id}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceNames.map((n) => {
                      const rowPrices = (stores ?? [])
                        .map((s) => priceMap.get(`${n}|${s.id}`)?.price)
                        .filter((v): v is number => v != null);
                      const min = rowPrices.length ? Math.min(...rowPrices) : null;
                      return (
                        <tr key={n}>
                          <td>{n}</td>
                          {stores?.map((s) => {
                            const cell = priceMap.get(`${n}|${s.id}`);
                            if (!cell) return <td key={s.id}>–</td>;
                            return (
                              <td
                                key={s.id}
                                className={cell.price === min ? "best-price" : ""}
                              >
                                {settings.currency}
                                {cell.price.toFixed(2)}
                                {cell.onSale ? (
                                  <span className="pill sale">{t("prices.sale")}</span>
                                ) : null}{" "}
                                <button
                                  className="danger linklike"
                                  title={t("common.delete")}
                                  onClick={() => removePrice(cell.id)}
                                >
                                  ✕
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {priceNames.length === 0 && <p className="muted">{t("prices.noPrices")}</p>}
        </>
      )}
    </section>
  );
}
