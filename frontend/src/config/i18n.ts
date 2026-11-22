import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import te from "@/locales/te.json";

export type Language = "en" | "te";
const key = "mana-language";
let saved: string | null = null;
try {
  saved = localStorage.getItem(key);
} catch {
  /* Browsers may disable storage. */
}
void i18n.use(initReactI18next).init({
  lng: saved === "te" ? "te" : "en",
  fallbackLng: "en",
  resources: { en: { translation: en }, te: { translation: te } },
  interpolation: { escapeValue: false },
});
export async function setLanguage(language: Language) {
  await i18n.changeLanguage(language);
  try {
    localStorage.setItem(key, language);
  } catch {
    /* The in-memory choice still applies. */
  }
}
document.documentElement.lang = i18n.language || "en";
i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});
export default i18n;
