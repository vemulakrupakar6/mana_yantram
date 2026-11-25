import { useQuery } from "@tanstack/react-query";
import { Tractor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { operatorSelfApi } from "@/api/operations.api";
import { DashboardHeading } from "@/components/common/dashboard-panels";
import { EmptyState, ErrorState, FullPageLoader, StatusBadge } from "@/components/common/shared";
import { ProviderStatusBadge } from "@/components/provider/ProviderParts";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import type { ProviderStatus } from "@/types/provider";

export function OperatorDashboard() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const me = useQuery({
    queryKey: ["operator-me"],
    queryFn: ({ signal }) => operatorSelfApi.me(signal),
    retry: false,
  });
  if (me.isPending) return <FullPageLoader />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  const { fullName, licenceNo, provider, equipment } = me.data;
  return (
    <div className="dashboard-content">
      <DashboardHeading title="operatorDash" detail="operatorOverview" />
      <section className="panel dashboard-section">
        <dl className="account-facts">
          <div>
            <dt>{t("fullName")}</dt>
            <dd>{fullName}</dd>
          </div>
          <div>
            <dt>{t("licenceNo")}</dt>
            <dd>{licenceNo ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("employer")}</dt>
            <dd>
              {provider.name} ({provider.providerNo}){" "}
              <ProviderStatusBadge status={provider.status as ProviderStatus} />
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel dashboard-section">
        <h2>{t("assignedEquipment")}</h2>
        {equipment.length === 0 ? (
          <EmptyState title={t("noAssignedEquipment")} />
        ) : (
          <ul className="document-list">
            {equipment.map((e) => (
              <li key={e.id} className="document-item">
                <div className="document-head">
                  <Tractor size={18} aria-hidden="true" />
                  <strong>
                    {e.make} {e.model} ({e.year})
                  </strong>
                  <span className="muted">{name(e.category)}</span>
                  <StatusBadge tone={e.status === "ACTIVE" ? "success" : "neutral"}>
                    {t("equip_" + e.status)}
                  </StatusBadge>
                </div>
                <p className="muted">
                  {e.units
                    .map((u) => u.unitLabel + (u.registrationNo ? ` (${u.registrationNo})` : ""))
                    .join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
