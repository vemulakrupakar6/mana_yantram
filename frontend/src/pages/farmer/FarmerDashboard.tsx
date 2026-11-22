import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState, StatusBadge } from "@/components/common/shared";
import { ServiceCards } from "@/components/common/service-cards";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";
import { DashboardHeading, Metrics } from "@/components/common/dashboard-panels";

export function FarmerDashboard() {
  const { t } = useTranslation();
  const status = useAuth((state) => state.user!.onboarding.FARMER ?? "NOT_STARTED");
  return (
    <div className="dashboard-content">
      <DashboardHeading title="farmerDash" detail="farmerOverview" />
      {status !== "COMPLETED" && (
        <div className="dash-notice">
          <div>
            <StatusBadge tone="warning">{t(status)}</StatusBadge>
            <p>{t("profileNotice")}</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/onboarding">{t("onboarding")}</Link>
          </Button>
        </div>
      )}
      <Metrics portal="farmer" />
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>{t("categories")}</h2>
            <p className="muted">{t("categoryBody")}</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/services">{t("browse")}</Link>
          </Button>
        </div>
        <ServiceCards />
      </section>
      <section className="panel dashboard-section">
        <h2>{t("recentBookings")}</h2>
        <EmptyState title={t("noBookings")} />
      </section>
    </div>
  );
}
