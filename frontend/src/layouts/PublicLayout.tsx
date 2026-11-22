import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo, LanguageSwitcher } from "@/components/common/branding";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/stores/auth";

const links = [
  ["/", "home"],
  ["/services", "services"],
  ["/about", "about"],
  ["/help", "help"],
] as const;
export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const signedIn = useAuth((state) => state.isAuthenticated);
  const { t } = useTranslation();
  return (
    <header className="public-header">
      <div className="site-wrap nav-inner">
        <AppLogo />
        <nav
          id="public-navigation"
          className={open ? "public-nav open" : "public-nav"}
          aria-label={t("menu")}
        >
          {links.map(([href, label]) => (
            <NavLink key={href} to={href} end onClick={() => setOpen(false)}>
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <LanguageSwitcher />
          <Button variant="outline" size="small" asChild>
            <Link to={signedIn ? "/profile" : "/login"}>{t(signedIn ? "profile" : "login")}</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="public-navigation"
            aria-label={t("menu")}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </Button>
        </div>
      </div>
    </header>
  );
}
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="public-footer">
      <div className="site-wrap footer-inner">
        <div>
          <AppLogo compact />
          <p>{t("tagline")}</p>
        </div>
        <nav aria-label={t("help")}>
          <Link to="/about">{t("about")}</Link>
          <Link to="/help">{t("help")}</Link>
          <Link to="/terms">{t("terms")}</Link>
          <Link to="/privacy">{t("privacy")}</Link>
        </nav>
      </div>
    </footer>
  );
}
export function PublicLayout() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <a href="#main-content" className="skip-link">
        {t("skip")}
      </a>
      <PublicNavbar />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
