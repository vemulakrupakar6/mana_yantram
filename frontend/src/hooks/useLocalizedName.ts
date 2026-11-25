import { useTranslation } from "react-i18next";

/** Returns the Telugu name when the UI language is Telugu (falling back to English). */
export function useLocalizedName() {
  const { i18n } = useTranslation();
  return (item: { nameEn: string; nameTe: string }) =>
    (i18n.language === "te" && item.nameTe) || item.nameEn;
}
