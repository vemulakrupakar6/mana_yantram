import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authApi } from "@/api/auth.api";
import { farmersApi } from "@/api/farmers.api";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState, ErrorState, FullPageLoader, PageHeader } from "@/components/common/shared";
import { FarmerProfileForm } from "@/components/farmer/FarmerProfileForm";
import { PlotForm } from "@/components/farmer/PlotForm";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setLanguage } from "@/config/i18n";
import { errorKey } from "@/features/auth/errors";
import { useAuth } from "@/stores/auth";
import type { Farmer, Plot } from "@/types/farmer";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import axios from "axios";
import type { ApiError } from "@/types/auth";

export const farmerKey = ["farmer-me"] as const;
export function useFarmerMe() {
  return useQuery({
    queryKey: farmerKey,
    queryFn: ({ signal }) => farmersApi.me(signal),
    retry: false,
  });
}
const profileMissing = (error: unknown) =>
  axios.isAxiosError<ApiError>(error) && error.response?.data?.code === "PROFILE_REQUIRED";

/** Refresh the signed-in user (display name, onboarding status) after a profile change. */
export async function refreshUser() {
  const user = await authApi.me();
  useAuth.getState().setUser(user);
  await setLanguage(user.preferredLanguage);
}

export function FarmerProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useFarmerMe();
  if (query.isPending) return <FullPageLoader />;
  if (profileMissing(query.error)) return <Navigate to="/onboarding" replace />;
  if (query.isError) return <ErrorState title={t("error")} retry={() => void query.refetch()} />;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("myProfile")} description={t("farmerProfileIntro")} />
      <section className="panel dashboard-section">
        <dl className="account-facts">
          <div>
            <dt>{t("username")}</dt>
            <dd>{query.data.username}</dd>
          </div>
          <div>
            <dt>{t("aadhaar")}</dt>
            <dd>{query.data.aadhaar.masked ?? "—"}</dd>
          </div>
        </dl>
        <FarmerProfileForm
          key={query.data.id + query.data.aadhaar.masked}
          farmer={query.data}
          onSaved={async (saved: Farmer) => {
            queryClient.setQueryData(farmerKey, saved);
            await refreshUser();
            toast.success(t("changesSaved"));
          }}
        />
      </section>
    </div>
  );
}

export function PlotsListPage() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const queryClient = useQueryClient();
  const me = useFarmerMe();
  const plots = useQuery({
    queryKey: ["farmer-plots"],
    queryFn: ({ signal }) => farmersApi.plots(signal),
    enabled: me.isSuccess,
  });
  const remove = useMutation({
    mutationFn: farmersApi.deletePlot,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["farmer-plots"] });
      void queryClient.invalidateQueries({ queryKey: farmerKey });
      toast.success(t("plotDeleted"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError || plots.isError)
    return <ErrorState title={t("error")} retry={() => void plots.refetch()} />;
  const columns: Column<Plot>[] = [
    { key: "survey", header: "surveyNo", render: (plot) => plot.surveyNo },
    { key: "extent", header: "extentAcres", render: (plot) => plot.extentAcres },
    { key: "village", header: "village", render: (plot) => name(plot.village) },
    {
      key: "crops",
      header: "cropsGrown",
      render: (plot) =>
        plot.crops.map((c) => `${name(c.crop)} (${t(c.season)} ${c.year})`).join(", ") || "—",
    },
    {
      key: "actions",
      header: "actions",
      render: (plot) => (
        <div className="inline-actions">
          <Button variant="outline" size="small" asChild>
            <Link to={"/farmer/plots/" + plot.id}>{t("edit")}</Link>
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="small">
                {t("delete")}
              </Button>
            }
            title={t("confirmDeletePlot")}
            description={t("deletePlotBody")}
            action={t("delete")}
            onConfirm={() => remove.mutate(plot.id)}
          />
        </div>
      ),
    },
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("myPlots")} description={t("plotsIntro")}>
        <Button asChild>
          <Link to="/farmer/plots/new">{t("addPlot")}</Link>
        </Button>
      </PageHeader>
      <section className="panel dashboard-section">
        {plots.isPending ? (
          <FullPageLoader />
        ) : plots.data.length ? (
          <DataTable columns={columns} rows={plots.data} empty={t("noPlots")} />
        ) : (
          <EmptyState title={t("noPlots")} />
        )}
      </section>
    </div>
  );
}

export function PlotEditPage() {
  const { t } = useTranslation();
  const { plotId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useFarmerMe();
  const plot = useQuery({
    queryKey: ["farmer-plot", plotId],
    queryFn: ({ signal }) => farmersApi.plot(plotId!, signal),
    enabled: Boolean(plotId),
    retry: false,
  });
  if (me.isPending || (plotId && plot.isPending)) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  if (plotId && plot.isError)
    return <ErrorState title={t("notFound")} retry={() => navigate("/farmer/plots")} />;
  const farmer = me.data;
  const first = params.get("first") === "1";
  return (
    <div className="dashboard-content">
      <PageHeader
        title={t(plotId ? "editPlot" : "addPlot")}
        description={first ? t("firstPlotIntro") : undefined}
      />
      <section className="panel dashboard-section">
        <PlotForm
          plot={plot.data}
          geo={{
            districtId: farmer.district.id,
            mandalId: farmer.mandal.id,
            villageId: farmer.village.id,
          }}
          cancelTo="/farmer/plots"
          secondary={
            first && (
              <Button variant="ghost" asChild>
                <Link to="/farmer/dashboard">{t("skipForNow")}</Link>
              </Button>
            )
          }
          onSubmit={async (payload) => {
            if (plotId) await farmersApi.updatePlot(plotId, payload);
            else await farmersApi.createPlot(payload);
            await queryClient.invalidateQueries({ queryKey: ["farmer-plots"] });
            await queryClient.invalidateQueries({ queryKey: ["farmer-plot", plotId] });
            await queryClient.invalidateQueries({ queryKey: farmerKey });
            toast.success(t("changesSaved"));
            navigate("/farmer/plots");
          }}
        />
      </section>
    </div>
  );
}
