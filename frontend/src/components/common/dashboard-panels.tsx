import { useTranslation } from "react-i18next";
import { dashboardMetrics } from "@/components/navigation/menus";
import { useAuth } from "@/stores/auth";
import type { Portal } from "@/types/auth";
import { PageHeader } from "./shared";

export function DashboardHeading({ title, detail }: { title: string; detail: string }) {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  return (
    <div>
      <p className="eyebrow dashboard-greeting">
        {t("welcome", { name: user.displayName || user.username })}
      </p>
      <PageHeader title={t(title)} description={t(detail)} />
    </div>
  );
}
export function Metrics({ portal }: { portal: Portal }) {
  const { t, i18n } = useTranslation();
  const zero = new Intl.NumberFormat(i18n.language === "te" ? "te-IN" : "en-IN").format(0);
  return (
    <dl className="metrics-grid">
      {dashboardMetrics[portal].map(([label, Icon]) => (
        <div className="metric-card" key={label}>
          <span className="icon-tile">
            <Icon size={22} />
          </span>
          <div>
            <dd>{zero}</dd>
            <dt>{t(label)}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
