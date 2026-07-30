import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db, { normalizeItemName } from "./db";
import { useSettings } from "./settings";
import ListsView from "./views/ListsView";
import PricesView from "./views/PricesView";
import PlanView from "./views/PlanView";
import AlertsView from "./views/AlertsView";
import SettingsView from "./views/SettingsView";

type Tab = "lists" | "prices" | "plan" | "alerts" | "settings";

const ICONS: Record<Tab, string> = {
  lists: "📝",
  prices: "🏷️",
  plan: "🗺️",
  alerts: "🔔",
  settings: "⚙️"
};

export default function App() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("lists");

  const saleCount = useLiveQuery(
    async () => {
      const [items, sales] = await Promise.all([
        db.items.where("checked").equals(0).toArray(),
        db.prices.filter((p) => p.onSale === 1).toArray()
      ]);
      const saleNames = new Set(sales.map((s) => s.itemName));
      const wanted = new Set(items.map((i) => normalizeItemName(i.name)));
      let n = 0;
      for (const name of wanted) if (saleNames.has(name)) n++;
      return n;
    },
    [],
    0
  );

  const tabs: Array<{ id: Tab; visible: boolean; badge?: number }> = [
    { id: "lists", visible: true },
    { id: "prices", visible: settings.features.prices },
    { id: "plan", visible: settings.features.plan },
    { id: "alerts", visible: settings.features.alerts, badge: saleCount },
    { id: "settings", visible: true }
  ];
  const visibleTabs = tabs.filter((x) => x.visible);
  const active = visibleTabs.some((x) => x.id === tab) ? tab : "lists";

  return (
    <div className="app">
      <header className="topbar">
        <h1>🛒 {t("app.title")}</h1>
      </header>
      <main className="content">
        {active === "lists" && <ListsView />}
        {active === "prices" && <PricesView />}
        {active === "plan" && <PlanView />}
        {active === "alerts" && <AlertsView />}
        {active === "settings" && <SettingsView />}
      </main>
      <nav className="tabbar">
        {visibleTabs.map((x) => (
          <button
            key={x.id}
            className={active === x.id ? "tab active" : "tab"}
            onClick={() => setTab(x.id)}
          >
            <span className="tab-icon">{ICONS[x.id]}</span>
            <span>{t(`tabs.${x.id}`)}</span>
            {x.badge ? <span className="badge">{x.badge}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
