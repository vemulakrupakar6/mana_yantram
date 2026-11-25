import { useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authApi } from "@/api/auth.api";
import { AppLogo, LanguageSwitcher } from "@/components/common/branding";
import { ErrorState, FullPageLoader, UserAvatar } from "@/components/common/shared";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/navigation/LogoutButton";
import { portalMenus } from "@/components/navigation/menus";
import { useAuth } from "@/stores/auth";
import { roleLabels, type Portal } from "@/types/auth";

export function Topbar({ toggle }: { toggle?: { open: boolean; change: () => void } }) {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  const role = useAuth((state) => state.activeRole);
  const name = user.displayName || user.username;
  return (
    <header className="dash-topbar">
      <div className="topbar-left">
        {toggle && (
          <Button
            size="icon"
            variant="ghost"
            className="dash-menu-toggle"
            aria-label={t("menu")}
            aria-controls="dashboard-sidebar"
            aria-expanded={toggle.open}
            onClick={toggle.change}
          >
            {toggle.open ? <X /> : <Menu />}
          </Button>
        )}
        <AppLogo />
      </div>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <Link className="topbar-account" to="/profile" aria-label={t("profile")}>
          <UserAvatar name={name} />
          <span>
            <strong>{name}</strong>
            {role && <small>{t(roleLabels[role])}</small>}
          </span>
        </Link>
      </div>
    </header>
  );
}
export function Sidebar({
  portal,
  open,
  close,
}: {
  portal: Portal;
  open: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  return (
    <aside className={"dashboard-sidebar" + (open ? " open" : "")} id="dashboard-sidebar">
      <nav aria-label={t("menu")}>
        {portalMenus[portal]
          .filter(({ permission }) => !permission || user.permissions.includes(permission))
          .map(({ label, href, icon: Icon }) =>
            href ? (
              <NavLink key={label} to={href} onClick={close} className="side-item">
                <Icon size={19} />
                {t(label)}
              </NavLink>
            ) : (
              <span
                key={label}
                className="side-item side-disabled"
                aria-disabled="true"
                title={t("comingSoon")}
              >
                <Icon size={19} />
                {t(label)}
                <span className="sr-only"> · {t("comingSoon")}</span>
              </span>
            ),
          )}
        {user.roles.length > 1 && (
          <NavLink to="/select-role" className="side-item" onClick={close}>
            {t("switchRole")}
          </NavLink>
        )}
      </nav>
      <LogoutButton className="sidebar-logout" />
    </aside>
  );
}
export function DashboardLayout({ portal }: { portal: Portal }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const userId = useAuth((state) => state.user!.id);
  const access = useQuery({
    queryKey: ["portal-access", userId, portal],
    queryFn: ({ signal }) => authApi.checkPortal(portal, signal),
    retry: false,
  });
  if (axios.isAxiosError(access.error) && access.error.response?.status === 403)
    return <Navigate to="/403" replace />;
  return (
    <div
      className="dashboard-shell"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <a href="#main-content" className="skip-link">
        {t("skip")}
      </a>
      <Topbar toggle={{ open, change: () => setOpen(!open) }} />
      <div className="dashboard-frame">
        <Sidebar portal={portal} open={open} close={() => setOpen(false)} />
        <main id="main-content" className="dash-main" tabIndex={-1}>
          {access.isPending ? (
            <FullPageLoader />
          ) : access.isError ? (
            <ErrorState title={t("error")} retry={() => void access.refetch()} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
export function FarmerLayout() {
  return <DashboardLayout portal="farmer" />;
}
export function ProviderLayout() {
  return <DashboardLayout portal="provider" />;
}
export function OperatorLayout() {
  return <DashboardLayout portal="operator" />;
}
export function AdminLayout() {
  return <DashboardLayout portal="admin" />;
}

export function AccountLayout() {
  const { t } = useTranslation();
  return (
    <div className="account-shell">
      <a href="#main-content" className="skip-link">
        {t("skip")}
      </a>
      <Topbar />
      <main className="site-wrap account-main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
