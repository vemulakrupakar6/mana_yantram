import { useTranslation } from "react-i18next";
import { DashboardHeading, Metrics } from "@/components/common/dashboard-panels";
import { StatusBadge } from "@/components/common/shared";
import { useAuth } from "@/stores/auth";
import { roleLabels } from "@/types/auth";

export function AdminDashboard() {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  const role = useAuth((state) => state.activeRole)!;
  return (
    <div className="dashboard-content">
      <DashboardHeading title="adminDash" detail="adminOverview" />
      <Metrics portal="admin" />
      <div className="dashboard-columns">
        <section className="panel dashboard-section">
          <h2>{t("officer")}</h2>
          <dl className="account-facts">
            <div>
              <dt>{t("displayName")}</dt>
              <dd>{user.displayName || user.username}</dd>
            </div>
            <div>
              <dt>{t("role")}</dt>
              <dd>
                <StatusBadge>{t(roleLabels[role])}</StatusBadge>
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel dashboard-section">
          <h2>{t("upcoming")}</h2>
          <ul className="upcoming-list">
            {["verification", "reports", "masters", "userRoles"].map((item) => (
              <li key={item}>
                {t(item)}
                <StatusBadge>{t("comingSoon")}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
