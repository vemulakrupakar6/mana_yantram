import { useTranslation } from "react-i18next";
import { EmptyState, StatusBadge } from "@/components/common/shared";
import { DashboardHeading, Metrics } from "@/components/common/dashboard-panels";
import { useAuth } from "@/stores/auth";

export function ProviderDashboard() {
  const { t } = useTranslation();
  const status = useAuth((state) => state.user!.onboarding.PROVIDER ?? "NOT_STARTED");
  return (
    <div className="dashboard-content">
      <DashboardHeading title="providerDash" detail="providerOverview" />
      <div className="dash-notice">
        <div>
          <span>{t("status")}</span>
          <StatusBadge tone={status === "COMPLETED" ? "success" : "warning"}>
            {t(status)}
          </StatusBadge>
        </div>
        <div>
          <span>{t("verification")}</span>
          <StatusBadge tone="warning">{t("unverified")}</StatusBadge>
        </div>
      </div>
      <Metrics portal="provider" />
      <div className="dashboard-columns">
        <section className="panel dashboard-section">
          <h2>{t("myEquipment")}</h2>
          <EmptyState title={t("noEquipment")} />
        </section>
        <section className="panel dashboard-section">
          <h2>{t("requests")}</h2>
          <EmptyState title={t("noRequests")} />
        </section>
      </div>
    </div>
  );
}
