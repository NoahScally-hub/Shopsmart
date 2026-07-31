import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import i18n from "./i18n";

export type Language = "en" | "fr" | "es";
export type Theme = "system" | "light" | "dark";
export type Accent = "green" | "blue" | "purple" | "orange";

export interface FeatureToggles {
  prices: boolean;
  plan: boolean;
  alerts: boolean;
  insights: boolean;
  voice: boolean;
  recipes: boolean;
}

export interface Settings {
  language: Language;
  theme: Theme;
  accent: Accent;
  features: FeatureToggles;
  gasPricePerL: number;
  fuelLper100km: number;
  currency: string;
}

export const DEFAULTS: Settings = {
  language: (["en", "fr", "es"].includes(i18n.language)
    ? i18n.language
    : "en") as Language,
  theme: "system",
  accent: "green",
  features: {
    prices: true,
    plan: true,
    alerts: true,
    insights: true,
    voice: true,
    recipes: false
  },
  gasPricePerL: 1.6,
  fuelLper100km: 8,
  currency: "$"
};

const KEY = "shopsmart-settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      features: { ...DEFAULTS.features, ...(parsed.features ?? {}) }
    };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}>({ settings: DEFAULTS, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        settings.theme === "dark" || (settings.theme === "system" && mq.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.dataset.accent = settings.accent;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, settings.accent]);

  useEffect(() => {
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language]);

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
