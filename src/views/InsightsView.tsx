import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { useSettings } from "../settings";
import { supabase, isCloudConfigured, useSession } from "../supabase";
import {
  monthlySpend,
  priceTrends,
  saleStats,
  storeTotals,
  tripSummary,
  type MonthBucket,
  type PriceTrend
} from "../insights";

/** Bar with only its far end rounded, so the baseline stays flat. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    "Z"
  ].join(" ");
}

function MonthlyChart({
  buckets,
  money,
  locale
}: {
  buckets: MonthBucket[];
  money: (v: number) => string;
  locale: string;
}) {
  const W = 360;
  const H = 170;
  const TOP = 24;
  const BOTTOM = 28;
  const GAP = 8;
  const plotH = H - TOP - BOTTOM;
  const barW = (W - GAP * (buckets.length - 1)) / buckets.length;
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const label = (b: MonthBucket) =>
    new Date(b.year, b.month, 1).toLocaleDateString(locale, { month: "short" });

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={buckets
        .map((b) => `${label(b)} ${money(b.total)}`)
        .join(", ")}
    >
      <line
        x1="0"
        y1={TOP + plotH}
        x2={W}
        y2={TOP + plotH}
        className="chart-axis"
      />
      {buckets.map((b, i) => {
        const x = i * (barW + GAP);
        const h = max > 0 ? (b.total / max) * plotH : 0;
        const y = TOP + plotH - h;
        return (
          <g key={`${b.year}-${b.month}`}>
            {b.total > 0 && (
              <>
                <path d={barPath(x, y, barW, h)} className="chart-bar" />
                <text
                  x={x + barW / 2}
                  y={y - 7}
                  className="chart-value"
                  textAnchor="middle"
                >
                  {money(b.total)}
                </text>
              </>
            )}
            <text
              x={x + barW / 2}
              y={H - 9}
              className="chart-label"
              textAnchor="middle"
            >
              {label(b)}
            </text>
            <title>
              {label(b)}: {money(b.total)}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

export default function InsightsView() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const { session } = useSession();
  const trips = useLiveQuery(() => db.trips.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const [trends, setTrends] = useState<PriceTrend[] | null>(null);
  const [trendsError, setTrendsError] = useState("");

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    supabase
      .from("price_history")
      .select("item_name, price, observed_at")
      .order("observed_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setTrendsError(error.message);
        else setTrends(priceTrends(data ?? []));
      });
    return () => {
      active = false;
    };
  }, [session]);

  if (!trips || !stores || !prices) return null;

  const money = (v: number) => `${settings.currency}${v.toFixed(2)}`;
  const summary = tripSummary(trips);
  const buckets = monthlySpend(trips, 6);
  const byStore = storeTotals(trips, stores);
  const sales = saleStats(prices);
  const maxStore = Math.max(...byStore.map((s) => s.total), 1);

  return (
    <section>
      <h2>{t("insights.title")}</h2>

      {summary.trips === 0 ? (
        <p className="muted">{t("insights.empty")}</p>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{money(summary.total)}</span>
              <span className="stat-label">{t("insights.totalSpent")}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{summary.trips}</span>
              <span className="stat-label">{t("insights.trips")}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{money(summary.average)}</span>
              <span className="stat-label">{t("insights.avgTrip")}</span>
            </div>
          </div>

          <h3>{t("insights.monthlyTitle")}</h3>
          <div className="card">
            <MonthlyChart
              buckets={buckets}
              money={money}
              locale={i18n.language}
            />
          </div>

          <h3>{t("insights.storesTitle")}</h3>
          <ul className="cards">
            {byStore.map((s) => (
              <li key={s.storeId} className="card">
                <div className="row spread" style={{ marginBottom: 6 }}>
                  <strong>{s.name || t("insights.unknownStore")}</strong>
                  <span className="tabular">{money(s.total)}</span>
                </div>
                <div
                  className="hbar-track"
                  role="img"
                  aria-label={`${s.name}: ${money(s.total)}`}
                >
                  <div
                    className="hbar-fill"
                    style={{ width: `${Math.max(2, (s.total / maxStore) * 100)}%` }}
                  />
                </div>
                <span className="muted">
                  {t("insights.tripsCount", { count: s.trips })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>{t("insights.saleTitle")}</h3>
      {sales.tracked === 0 ? (
        <p className="muted">{t("insights.noPrices")}</p>
      ) : (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <span className="stat-value">{Math.round(sales.ratio * 100)}%</span>
            <span className="muted">
              {t("insights.saleSummary", {
                onSale: sales.onSale,
                total: sales.tracked
              })}
            </span>
          </div>
          <div className="hbar-track">
            <div
              className="hbar-fill sale"
              style={{ width: `${sales.ratio * 100}%` }}
            />
          </div>
        </div>
      )}

      <h3>{t("insights.historyTitle")}</h3>
      {!isCloudConfigured || !session ? (
        <p className="muted">{t("insights.historySignIn")}</p>
      ) : trendsError ? (
        <p className="muted" style={{ color: "var(--danger)" }}>
          {trendsError}
        </p>
      ) : trends === null ? (
        <p className="muted">{t("insights.loading")}</p>
      ) : trends.length === 0 ? (
        <p className="muted">{t("insights.historyEmpty")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("insights.colLowest")}</th>
                <th>{t("insights.colLatest")}</th>
                <th>{t("insights.colHighest")}</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((r) => (
                <tr key={r.itemName}>
                  <td>{r.itemName}</td>
                  <td className="tabular best-price">{money(r.lowest)}</td>
                  <td className="tabular">{money(r.latest)}</td>
                  <td className="tabular">{money(r.highest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.trips === 0 && <p className="muted">{t("insights.emptyHint")}</p>}
    </section>
  );
}
