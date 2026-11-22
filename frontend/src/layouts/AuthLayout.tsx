import { Outlet } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo, LanguageSwitcher } from "@/components/common/branding";

export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="auth-layout">
      <aside className="auth-visual">
        <img src="/images/tractor.jpg" alt="" />
        <header>
          <AppLogo />
        </header>
        <div className="auth-photo-copy">
          <h2>{t("authTitle")}</h2>
          <p>{t("tagline")}</p>
          <ul>
            {["auth1", "auth2", "auth3"].map((key) => (
              <li key={key}>
                <CircleCheck size={19} />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <div className="mobile-auth-logo">
            <AppLogo />
          </div>
          <LanguageSwitcher />
        </div>
        <div className="auth-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
