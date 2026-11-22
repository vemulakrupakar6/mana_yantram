import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/common/shared";
import { LogoutButton } from "@/components/navigation/LogoutButton";
import { dashboardPreview } from "@/config/app";
import { onboardingPending, portalFor, safeReturn, userDestination } from "@/routes/access";
import { useAuth } from "@/stores/auth";
import { roleLabels, type RoleCode } from "@/types/auth";

export function OnboardingPage() {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  const role = useAuth((state) => state.activeRole);
  if (!role || !onboardingPending(user, role))
    return <Navigate to={userDestination(user, role)} replace />;
  const portal = portalFor(role);
  return (
    <section className="panel account-panel">
      <span className="icon-tile account-mark">
        <CheckCircle2 size={24} />
      </span>
      <PageHeader title={t("onboardingCreated")} description={t("onboardingBody")} />
      <dl className="account-facts">
        <div>
          <dt>{t("username")}</dt>
          <dd>{user.username}</dd>
        </div>
        <div>
          <dt>{t("selectedRole")}</dt>
          <dd>{t(roleLabels[role])}</dd>
        </div>
        <div>
          <dt>{t("status")}</dt>
          <dd>
            <StatusBadge tone="warning">{t(user.onboarding[role] ?? "NOT_STARTED")}</StatusBadge>
          </dd>
        </div>
      </dl>
      <div className="form-actions">
        <Button asChild>
          <Link to="/profile">{t("editAccount")}</Link>
        </Button>
        {dashboardPreview && portal && (
          <Button variant="outline" asChild>
            <Link to={"/" + portal + "/dashboard"}>{t("preview")}</Link>
          </Button>
        )}
        <LogoutButton />
      </div>
    </section>
  );
}
export function SelectRolePage() {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  const active = useAuth((state) => state.activeRole);
  const select = useAuth((state) => state.selectRole);
  const [role, setRole] = useState<RoleCode | null>(active);
  const location = useLocation();
  const navigate = useNavigate();
  if (user.roles.length < 2) return <Navigate to={userDestination(user, active)} replace />;
  return (
    <section className="panel account-panel">
      <PageHeader title={t("selectRole")} description={t("selectAuthorized")} />
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (role && select(role))
            navigate(userDestination(user, role, safeReturn(location.state?.next)), {
              replace: true,
            });
        }}
      >
        <fieldset className="role-options" aria-label={t("selectRole")}>
          {user.roles.map((value) => (
            <label className="role-card" key={value}>
              <input
                type="radio"
                name="role"
                checked={role === value}
                onChange={() => setRole(value)}
              />
              <span className="icon-tile">
                <ShieldCheck size={21} />
              </span>
              <strong>{t(roleLabels[value])}</strong>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <Button type="submit" disabled={!role}>
            {t("continue")}
          </Button>
          <LogoutButton />
        </div>
      </form>
    </section>
  );
}
