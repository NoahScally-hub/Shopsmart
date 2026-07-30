import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

function storedLanguage(): string | undefined {
  try {
    const raw = localStorage.getItem("shopsmart-settings");
    return raw ? JSON.parse(raw).language : undefined;
  } catch {
    return undefined;
  }
}

function browserLanguage(): string {
  const code = navigator.language?.slice(0, 2);
  return code === "fr" || code === "es" ? code : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es }
  },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export default i18n;
