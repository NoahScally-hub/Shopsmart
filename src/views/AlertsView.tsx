import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db, { normalizeItemName } from "../db";
import { useSettings } from "../settings";

interface SaleAlert {
  itemName: string;
  listName: string;
  storeName: string;
  price: number;
}

export default function AlertsView() {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const alerts = useLiveQuery(async () => {
    const [items, prices, stores, lists] = await Promise.all([
      db.items.where("checked").equals(0).toArray(),
      db.prices.filter((p) => p.onSale === 1).toArray(),
      db.stores.toArray(),
      db.lists.toArray()
    ]);
    const storeName = new Map(stores.map((s) => [s.id!, s.name]));
    const listName = new Map(lists.map((l) => [l.id!, l.name]));
    const out: SaleAlert[] = [];
    for (const it of items) {
      const norm = normalizeItemName(it.name);
      for (const p of prices) {
        if (p.itemName === norm) {
          out.push({
            itemName: it.name,
            listName: listName.get(it.listId) ?? "?",
            storeName: storeName.get(p.storeId) ?? "?",
            price: p.price
          });
        }
      }
    }
    return out;
  }, []);

  return (
    <section>
      <h2>{t("alerts.title")}</h2>
      {alerts?.length === 0 && <p className="muted">{t("alerts.empty")}</p>}
      <ul className="cards">
        {alerts?.map((a, i) => (
          <li key={i} className="card row spread">
            <span className="grow">
              <strong>{a.itemName}</strong>{" "}
              <span className="muted">({a.listName})</span>
              <div className="muted">
                {t("alerts.saleAt", { store: a.storeName })}
              </div>
            </span>
            <span className="pill sale">
              {settings.currency}
              {a.price.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
