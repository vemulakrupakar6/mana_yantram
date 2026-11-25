import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { submissionApi } from "@/api/admin-providers.api";
import { providersApi } from "@/api/providers.api";
import { DashboardHeading } from "@/components/common/dashboard-panels";
import { EmptyState, ErrorState, FullPageLoader, LoadingSpinner } from "@/components/common/shared";
import { Checklist, ProviderStatusBadge, RemarkNotice } from "@/components/provider/ProviderParts";
import { VerificationTimeline } from "@/components/provider/VerificationTimeline";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorKey } from "@/features/auth/errors";
import { profileMissing, providerKey, useProviderMe } from "@/pages/provider/ProviderPages";

export function ProviderDashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const checklist = useQuery({
    queryKey: ["provider-checklist"],
    queryFn: ({ signal }) => providersApi.checklist(signal),
    enabled: me.isSuccess,
  });
  const history = useQuery({
    queryKey: ["provider-history"],
    queryFn: ({ signal }) => submissionApi.history(signal),
    enabled: me.isSuccess,
  });
  const submit = useMutation({
    mutationFn: submissionApi.submit,
    onSuccess: (provider) => {
      queryClient.setQueryData(providerKey, provider);
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
      void queryClient.invalidateQueries({ queryKey: ["provider-history"] });
      void queryClient.invalidateQueries({ queryKey: ["provider-documents"] });
      toast.success(t("applicationSubmitted"));
    },
    onError: (error) => {
      toast.error(t(errorKey(error) === "error" ? "error" : errorKey(error)));
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
    },
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  const provider = me.data;
  const returned = provider.status === "RETURNED" ? provider.latestReturn : null;
  const canSubmitState = provider.status === "DRAFT" || provider.status === "RETURNED";
  const ready = Boolean(checklist.data?.canSubmit) && canSubmitState;
  const metrics = [
    ["registeredEquipment", provider.counts.equipment],
    ["units", provider.counts.units],
    ["operators", provider.counts.operators],
  ] as const;
  return (
    <div className="dashboard-content">
      <DashboardHeading title="providerDash" detail="providerOverview" />
      <section
        className={"dash-notice status-banner status-banner-" + provider.status.toLowerCase()}
      >
        <div>
          <ProviderStatusBadge status={provider.status} />
          <span className="muted">
            {t("providerNo")}: <strong>{provider.providerNo}</strong>
          </span>
          <p>{t("statusMessage_" + provider.status)}</p>
          {returned?.remarks && <RemarkNotice text={returned.remarks} />}
        </div>
        {provider.status === "RETURNED" && (
          <Button variant="outline" asChild>
            <Link to="/provider/profile">{t("reviewRemarks")}</Link>
          </Button>
        )}
      </section>
      <section className="panel dashboard-section">
        <h2>{t("applicationChecklist")}</h2>
        {checklist.isPending ? (
          <FullPageLoader />
        ) : checklist.isError ? (
          <ErrorState title={t("error")} retry={() => void checklist.refetch()} />
        ) : (
          <Checklist items={checklist.data.items} />
        )}
        {canSubmitState && (
          <div className="form-actions">
            <ConfirmDialog
              trigger={
                <Button disabled={!ready || submit.isPending} aria-busy={submit.isPending}>
                  {submit.isPending && <LoadingSpinner />}
                  {t(
                    provider.status === "RETURNED"
                      ? "resubmitForVerification"
                      : "submitForVerification",
                  )}
                </Button>
              }
              title={t("confirmSubmit")}
              description={t("confirmSubmitBody")}
              action={t("submitForVerification")}
              onConfirm={() => submit.mutate()}
            />
            {!ready && checklist.isSuccess && (
              <span className="muted">{t("completeChecklistFirst")}</span>
            )}
          </div>
        )}
      </section>
      <dl className="metrics-grid">
        {metrics.map(([label, value]) => (
          <div className="metric-card" key={label}>
            <span className="icon-tile">
              <Wrench size={22} />
            </span>
            <div>
              <dd>{value}</dd>
              <dt>{t(label)}</dt>
            </div>
          </div>
        ))}
      </dl>
      <section className="panel dashboard-section">
        <h2>{t("verificationHistory")}</h2>
        {history.isPending ? (
          <FullPageLoader />
        ) : history.isError ? (
          <ErrorState title={t("error")} />
        ) : (
          <VerificationTimeline items={history.data} />
        )}
      </section>
      <section className="panel dashboard-section">
        <h2>{t("requests")}</h2>
        <EmptyState title={t("noRequests")} />
      </section>
    </div>
  );
}
