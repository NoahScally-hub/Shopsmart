import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db, { normalizeItemName, recordTombstone } from "../db";
import { useSettings } from "../settings";
import { IconDownload, IconPin, IconTrash, IconUpload, IconX } from "../icons";
import { csvToPrices, downloadFile, pricesToCsv } from "../csv";
import { geocode, haversineKm } from "../geo";

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
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [locatingId, setLocatingId] = useState<number | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const openLocate = (id: number, current?: string) => {
    setLocatingId(id);
    setAddressDraft(current ?? "");
    setLookupError("");
  };

  const lookupAddress = async (storeId: number) => {
    const query = addressDraft.trim();
    if (!query) return;
    if (!settings.home) {
      setLookupError(t("prices.needHome"));
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    try {
      const hit = await geocode(query);
      if (!hit) {
        setLookupError(t("prices.notFound"));
        return;
      }
      const km = haversineKm(settings.home, hit);
      await db.stores.update(storeId, {
        address: query,
        lat: hit.lat,
        lon: hit.lon,
        distanceKm: Math.round(km * 10) / 10
      });
      setLocatingId(null);
    } catch {
      setLookupError(t("prices.lookupFailed"));
    } finally {
      setLookupBusy(false);
    }
  };

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
    await db.transaction("rw", db.stores, db.prices, db.tombstones, async () => {
      const doomed = await db.prices.where("storeId").equals(id).toArray();
      for (const p of doomed) await recordTombstone("prices", p.remoteId);
      await recordTombstone("stores", (await db.stores.get(id))?.remoteId);
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

  const removePrice = async (id: number) => {
    await db.transaction("rw", db.prices, db.tombstones, async () => {
      await recordTombstone("prices", (await db.prices.get(id))?.remoteId);
      await db.prices.delete(id);
    });
  };

  const exportPrices = () => {
    const storeById = new Map((stores ?? []).map((s) => [s.id!, s.name]));
    const rows = (prices ?? [])
      .map((p) => ({
        itemName: p.itemName,
        storeName: storeById.get(p.storeId) ?? "",
        price: p.price,
        onSale: p.onSale
      }))
      .filter((r) => r.storeName)
      .sort(
        (a, b) =>
          a.itemName.localeCompare(b.itemName) ||
          a.storeName.localeCompare(b.storeName)
      );
    downloadFile("shopsmart-prices.csv", pricesToCsv(rows));
  };

  const importPrices = async (file: File | undefined) => {
    if (!file) return;
    const rows = csvToPrices(await file.text());
    let imported = 0;
    if (rows.length) {
      await db.transaction("rw", db.stores, db.prices, async () => {
        // Match stores case-insensitively so "Walmart" and "walmart" in a
        // hand-edited file don't create a duplicate store.
        const byName = new Map(
          (await db.stores.toArray()).map((s) => [s.name.toLowerCase(), s.id!])
        );
        for (const row of rows) {
          let sid = byName.get(row.storeName.toLowerCase());
          if (sid == null) {
            sid = (await db.stores.add({
              name: row.storeName,
              distanceKm: 0
            })) as number;
            byName.set(row.storeName.toLowerCase(), sid);
          }
          const existing = await db.prices
            .where("[itemName+storeId]")
            .equals([row.itemName, sid])
            .first();
          const entry = {
            itemName: row.itemName,
            storeId: sid,
            price: row.price,
            onSale: row.onSale,
            updatedAt: Date.now()
          };
          if (existing) await db.prices.update(existing.id!, entry);
          else await db.prices.add(entry);
          imported++;
        }
      });
    }
    setImportMsg(t("prices.imported", { count: imported }));
    setTimeout(() => setImportMsg(""), 4000);
    if (fileRef.current) fileRef.current.value = "";
  };

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
          <li key={s.id} className="card">
            <div className="row spread" style={{ marginBottom: 0 }}>
              <span className="grow">
                <strong>{s.name}</strong>{" "}
                <span className="muted">{s.distanceKm} km</span>
                {s.address && <div className="muted">{s.address}</div>}
              </span>
              <button
                className="ghost"
                title={t("prices.setAddress")}
                aria-label={t("prices.setAddress")}
                onClick={() =>
                  locatingId === s.id ? setLocatingId(null) : openLocate(s.id!, s.address)
                }
              >
                <IconPin size={17} />
              </button>
              <button
                className="ghost danger"
                title={t("common.delete")}
                aria-label={t("common.delete")}
                onClick={() => removeStore(s.id!, s.name)}
              >
                <IconTrash size={17} />
              </button>
            </div>

            {locatingId === s.id && (
              <div style={{ marginTop: 10 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <input
                    className="grow"
                    value={addressDraft}
                    onChange={(e) => setAddressDraft(e.target.value)}
                    placeholder={t("prices.addressPlaceholder")}
                  />
                  <button
                    className="primary"
                    disabled={lookupBusy}
                    onClick={() => lookupAddress(s.id!)}
                  >
                    {lookupBusy ? t("prices.looking") : t("prices.find")}
                  </button>
                </div>
                <p className="muted">
                  {lookupError ? (
                    <span style={{ color: "var(--danger)" }}>{lookupError}</span>
                  ) : (
                    t("prices.addressHint")
                  )}
                </p>
              </div>
            )}
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

          <h3>{t("prices.bulkTitle")}</h3>
          <div className="row">
            <button onClick={exportPrices} disabled={(prices?.length ?? 0) === 0}>
              <IconDownload size={15} /> {t("prices.exportCsv")}
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <IconUpload size={15} /> {t("prices.importCsv")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => importPrices(e.target.files?.[0])}
            />
            {importMsg && <span className="pill">{importMsg}</span>}
          </div>
          <p className="muted">{t("prices.csvFormat")}</p>

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
                                  className="ghost danger"
                                  style={{ padding: 2, verticalAlign: "middle" }}
                                  title={t("common.delete")}
                                  aria-label={t("common.delete")}
                                  onClick={() => removePrice(cell.id)}
                                >
                                  <IconX size={12} />
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
