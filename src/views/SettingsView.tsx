import { useTranslation } from "react-i18next";
import db from "../db";
import {
  useSettings,
  type Accent,
  type Language,
  type Theme,
  type FeatureToggles
} from "../settings";
import { lazy, Suspense, useState } from "react";
import { downloadFile } from "../csv";
import { currentPosition } from "../geo";

// supabase-js is ~60 kB gzipped — keep it out of the initial bundle and load it
// only when the user actually opens Settings.
const CloudSync = lazy(() => import("./CloudSync"));

const ACCENTS: Array<{ id: Accent; color: string }> = [
  { id: "green", color: "#047857" },
  { id: "blue", color: "#4f46e5" },
  { id: "purple", color: "#7e22ce" },
  { id: "orange", color: "#c2410c" }
];

export default function SettingsView() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const useMyLocation = async () => {
    setLocating(true);
    setLocationError("");
    try {
      const home = await currentPosition();
      update({ home });
    } catch {
      // Covers both an outright denial and an unsupported browser.
      setLocationError(t("settings.locationDenied"));
    } finally {
      setLocating(false);
    }
  };

  const setFeature = (key: keyof FeatureToggles, value: boolean) =>
    update({ features: { ...settings.features, [key]: value } });

  const exportAll = async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      lists: await db.lists.toArray(),
      items: await db.items.toArray(),
      stores: await db.stores.toArray(),
      prices: await db.prices.toArray(),
      trips: await db.trips.toArray(),
      settings
    };
    downloadFile(
      "shopsmart-backup.json",
      JSON.stringify(data, null, 2),
      "application/json"
    );
  };

  const wipe = async () => {
    if (!confirm(t("settings.wipeConfirm"))) return;
    await db.delete();
    localStorage.removeItem("shopsmart-settings");
    location.reload();
  };

  const features: Array<{ key: keyof FeatureToggles; label: string }> = [
    { key: "prices", label: t("settings.fPrices") },
    { key: "plan", label: t("settings.fPlan") },
    { key: "alerts", label: t("settings.fAlerts") },
    { key: "insights", label: t("settings.fInsights") },
    { key: "voice", label: t("settings.fVoice") },
    { key: "recipes", label: t("settings.fRecipes") }
  ];

  return (
    <section>
      <h2>{t("settings.title")}</h2>

      <div className="settings-group">
        <label className="line">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as Language })}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
          </select>
        </label>
        <label className="line">
          {t("settings.theme")}
          <select
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as Theme })}
          >
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>
        <div className="line" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
          <span>{t("settings.accent")}</span>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={settings.accent === a.id ? "swatch selected" : "swatch"}
                style={{ background: a.color }}
                aria-label={a.id}
                onClick={() => update({ accent: a.id })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <strong>{t("settings.features")}</strong>
        {features.map((f) => (
          <label className="line" key={f.key}>
            {f.label}
            <input
              type="checkbox"
              checked={settings.features[f.key]}
              onChange={(e) => setFeature(f.key, e.target.checked)}
            />
          </label>
        ))}
      </div>

      <div className="settings-group">
        <label className="line">
          {t("settings.gasPrice")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={settings.gasPricePerL}
            onChange={(e) => update({ gasPricePerL: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="line">
          {t("settings.fuelUse")}
          <input
            type="number"
            min="0"
            step="0.1"
            value={settings.fuelLper100km}
            onChange={(e) => update({ fuelLper100km: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="line">
          {t("settings.currency")}
          <input
            style={{ width: 60 }}
            maxLength={3}
            value={settings.currency}
            onChange={(e) => update({ currency: e.target.value })}
          />
        </label>
      </div>

      <div className="settings-group">
        <strong>{t("settings.location")}</strong>
        <p className="muted" style={{ padding: "4px 0 0" }}>
          {t("settings.locationNote")}
        </p>
        <div className="row" style={{ marginTop: 10, marginBottom: 8 }}>
          <button onClick={useMyLocation} disabled={locating}>
            {locating ? t("settings.locating") : t("settings.useMyLocation")}
          </button>
          {settings.home && (
            <button className="danger" onClick={() => update({ home: null })}>
              {t("settings.clearHome")}
            </button>
          )}
        </div>
        <p className="muted" style={{ paddingBottom: 12 }}>
          {locationError ? (
            <span style={{ color: "var(--danger)" }}>{locationError}</span>
          ) : settings.home ? (
            t("settings.homeSet", {
              lat: settings.home.lat.toFixed(4),
              lon: settings.home.lon.toFixed(4)
            })
          ) : (
            t("settings.homeNotSet")
          )}
        </p>
      </div>

      <Suspense fallback={<div className="settings-group" style={{ height: 96 }} />}>
        <CloudSync />
      </Suspense>

      <div className="settings-group">
        <strong>{t("settings.data")}</strong>
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={exportAll}>{t("settings.exportAll")}</button>
          <button className="danger" onClick={wipe}>
            {t("settings.wipe")}
          </button>
        </div>
      </div>
    </section>
  );
}
