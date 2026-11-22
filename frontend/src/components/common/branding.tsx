import { Tractor, Globe2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { appName } from "@/config/app";
import { setLanguage } from "@/config/i18n";

export function AppLogo({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <Link to="/" className="app-logo">
      <span className="logo-icon">
        <Tractor size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="logo-text">
        <strong>{i18n.language === "te" ? t("brand") : appName}</strong>
        {!compact && (
          <small lang={i18n.language === "te" ? "en" : "te"}>
            {i18n.language === "te" ? appName : "మన యంత్రం"}
          </small>
        )}
      </span>
    </Link>
  );
}
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div className="language-switcher" aria-label={t("language")} role="group">
      <Globe2 size={15} aria-hidden="true" />
      {(
        [
          ["en", "English"],
          ["te", "తెలుగు"],
        ] as const
      ).map(([code, label]) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={i18n.language === code}
          onClick={() => void setLanguage(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
