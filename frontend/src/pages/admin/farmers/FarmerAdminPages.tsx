import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminFarmersApi, assistedApi } from "@/api/farmers.api";
import { DataTable, Pagination, type Column } from "@/components/common/DataTable";
import {
  EmptyState,
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import {
  emptyFarmerValues,
  FarmerFields,
  toProfilePayload,
} from "@/components/farmer/FarmerFields";
import { PlotForm } from "@/components/farmer/PlotForm";
import { TextField } from "@/components/forms/AuthFields";
import { FormField, SelectField } from "@/components/forms/fields";
import { emptyGeo, GeoSelect } from "@/components/forms/GeoSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { assistedFormSchema, type AssistedFormValues } from "@/schemas/farmer";
import { useAuth } from "@/stores/auth";
import type { Farmer, FarmerDetail } from "@/types/farmer";
import { generateTemporaryPassword } from "@/utils/password";

function useFarmerColumns(): Column<Farmer>[] {
  const { t } = useTranslation();
  const name = useLocalizedName();
  return [
    { key: "name", header: "fullName", render: (f) => f.fullName },
    { key: "username", header: "username", render: (f) => f.username },
    { key: "mobile", header: "mobile", render: (f) => f.mobile ?? "—" },
    {
      key: "place",
      header: "village",
      render: (f) => `${name(f.village)}, ${name(f.mandal)}`,
    },
    { key: "plots", header: "myPlots", render: (f) => f.plotCount },
    {
      key: "assisted",
      header: "registration",
      render: (f) => (
        <StatusBadge tone={f.assisted ? "warning" : "neutral"}>
          {t(f.assisted ? "assistedRegistrationBadge" : "selfRegistered")}
        </StatusBadge>
      ),
    },
  ];
}
function FarmerSummary({ farmer }: { farmer: FarmerDetail }) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  return (
    <>
      <section className="panel dashboard-section">
        <dl className="account-facts">
          {[
            ["username", farmer.username],
            ["mobile", farmer.mobile ?? "—"],
            ["gender", t(farmer.gender)],
            ["relativeName", `${t(farmer.relationType)}: ${farmer.relativeName}`],
            ["aadhaar", farmer.aadhaar.masked ?? "—"],
            [
              "village",
              `${name(farmer.village)}, ${name(farmer.mandal)}, ${name(farmer.district)}`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel dashboard-section">
        <h2>{t("myPlots")}</h2>
        {farmer.plots.length ? (
          <DataTable
            rows={farmer.plots}
            empty={t("noPlots")}
            columns={[
              { key: "s", header: "surveyNo", render: (p) => p.surveyNo },
              { key: "e", header: "extentAcres", render: (p) => p.extentAcres },
              { key: "v", header: "village", render: (p) => name(p.village) },
              {
                key: "c",
                header: "cropsGrown",
                render: (p) =>
                  p.crops.map((c) => `${name(c.crop)} (${t(c.season)} ${c.year})`).join(", ") ||
                  "—",
              },
            ]}
          />
        ) : (
          <EmptyState title={t("noPlots")} />
        )}
      </section>
    </>
  );
}

export function AdminFarmersPage() {
  const { t } = useTranslation();
  const columns = useFarmerColumns();
  const scope = useAuth((state) => state.user!.jurisdiction);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    assisted: "",
    districtId: "",
    mandalId: "",
  });
  const [geo, setGeo] = useState(emptyGeo);
  const query = useQuery({
    queryKey: ["admin-farmers", filters, page],
    queryFn: ({ signal }) => adminFarmersApi.list({ ...filters, page }, signal),
    placeholderData: keepPreviousData,
  });
  const columnsWithLink: Column<Farmer>[] = [
    {
      ...columns[0],
      render: (f) => (
        <Link className="text-link" to={"/admin/farmers/" + f.id}>
          {f.fullName}
        </Link>
      ),
    },
    ...columns.slice(1),
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("farmers")} description={t("adminFarmersIntro")} />
      <section className="panel dashboard-section">
        <form
          className="filter-row"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPage(1);
            setFilters({
              search: String(data.get("search") ?? ""),
              assisted: String(data.get("assisted") ?? ""),
              districtId: geo.districtId,
              mandalId: geo.mandalId,
            });
          }}
        >
          <FormField id="f-search" label={t("search")}>
            <Input id="f-search" name="search" defaultValue={filters.search} />
          </FormField>
          <FormField id="f-assisted" label={t("registration")}>
            <SelectField id="f-assisted" name="assisted" defaultValue={filters.assisted}>
              <option value="">{t("all")}</option>
              <option value="true">{t("assistedRegistrationBadge")}</option>
              <option value="false">{t("selfRegistered")}</option>
            </SelectField>
          </FormField>
          {scope?.level === "STATE" && (
            <GeoSelect idPrefix="f-geo" upTo="mandal" value={geo} onChange={setGeo} />
          )}
          <Button type="submit" variant="outline">
            {t("applyFilters")}
          </Button>
        </form>
        {query.isPending ? (
          <FullPageLoader />
        ) : query.isError ? (
          <ErrorState title={t("error")} retry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable columns={columnsWithLink} rows={query.data.items} empty={t("noFarmers")} />
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
export function AdminFarmerDetailPage() {
  const { t } = useTranslation();
  const { farmerId = "" } = useParams();
  const query = useQuery({
    queryKey: ["admin-farmer", farmerId],
    queryFn: ({ signal }) => adminFarmersApi.get(farmerId, signal),
    retry: false,
  });
  if (query.isPending) return <FullPageLoader />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  return (
    <div className="dashboard-content">
      <PageHeader title={query.data.fullName}>
        <Button variant="outline" asChild>
          <Link to="/admin/farmers">{t("back")}</Link>
        </Button>
      </PageHeader>
      <FarmerSummary farmer={query.data} />
    </div>
  );
}

/* ----------------------------- assisted registration ----------------------------- */

export function AssistedListPage() {
  const { t } = useTranslation();
  const columns = useFarmerColumns();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["assisted-farmers", search, page],
    queryFn: ({ signal }) => assistedApi.list({ search, page }, signal),
    placeholderData: keepPreviousData,
  });
  const withLink: Column<Farmer>[] = [
    {
      ...columns[0],
      render: (f) => (
        <Link className="text-link" to={"/admin/assisted-registration/" + f.id}>
          {f.fullName}
        </Link>
      ),
    },
    ...columns.slice(1, 5),
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("assistedRegistration")} description={t("assistedIntro")}>
        <Button asChild>
          <Link to="/admin/assisted-registration/new">{t("registerFarmer")}</Link>
        </Button>
      </PageHeader>
      <section className="panel dashboard-section">
        <form
          className="filter-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(String(new FormData(event.currentTarget).get("search") ?? ""));
          }}
        >
          <FormField id="a-search" label={t("search")}>
            <Input id="a-search" name="search" defaultValue={search} />
          </FormField>
          <Button type="submit" variant="outline">
            {t("applyFilters")}
          </Button>
        </form>
        {query.isPending ? (
          <FullPageLoader />
        ) : query.isError ? (
          <ErrorState title={t("error")} retry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable columns={withLink} rows={query.data.items} empty={t("noFarmers")} />
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

function Credentials({ username, password }: { username: string; password: string }) {
  const { t } = useTranslation();
  return (
    <section className="panel dashboard-section credentials-print" role="status">
      <h2>{t("shareOnce")}</h2>
      <p className="muted">{t("assistedShareBody")}</p>
      <dl className="account-facts">
        <div>
          <dt>{t("username")}</dt>
          <dd>{username}</dd>
        </div>
        <div>
          <dt>{t("temporaryPassword")}</dt>
          <dd className="secret-box">{password}</dd>
        </div>
      </dl>
      <Button variant="outline" className="no-print" onClick={() => window.print()}>
        {t("print")}
      </Button>
    </section>
  );
}

export function AssistedNewPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const scope = useAuth((state) => state.user!.jurisdiction);
  const [done, setDone] = useState<{ farmer: Farmer; password: string } | null>(null);
  const form = useForm<AssistedFormValues>({
    resolver: zodResolver(assistedFormSchema),
    defaultValues: {
      ...emptyFarmerValues,
      districtId: scope?.districtId ?? "",
      mandalId: scope?.mandalId ?? "",
      username: "",
      temporaryPassword: "",
      consent: false,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const submit = handleSubmit(async (values) => {
    try {
      const profile = toProfilePayload({ ...values, removeAadhaar: false });
      const farmer = await assistedApi.register({
        account: { username: values.username, temporaryPassword: values.temporaryPassword },
        profile,
        consent: { farmerConsented: true, acceptTerms: true, acceptPrivacyPolicy: true },
      });
      void queryClient.invalidateQueries({ queryKey: ["assisted-farmers"] });
      toast.success(t("farmerRegistered"));
      setDone({ farmer, password: values.temporaryPassword });
    } catch (error) {
      const key = errorKey(error);
      if (key === "usernameTaken") setError("username", { message: key });
      else if (key === "aadhaarTaken") setError("aadhaarNumber", { message: key });
      else if (key === "mobileTaken") setError("mobile", { message: key });
      else if (!applyServerErrors(error, setError, ["districtId", "mandalId", "villageId"]))
        setError("root", { message: key });
    }
  });
  if (done)
    return (
      <div className="dashboard-content">
        <PageHeader title={done.farmer.fullName} description={t("farmerRegistered")} />
        <Credentials username={done.farmer.username} password={done.password} />
        <div className="form-actions no-print">
          <Button asChild>
            <Link to={"/admin/assisted-registration/" + done.farmer.id + "/plots/new"}>
              {t("addPlot")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/assisted-registration">{t("backToList")}</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <div className="dashboard-content">
      <PageHeader title={t("registerFarmer")} description={t("assistedFormIntro")} />
      <form className="panel dashboard-section form-stack" onSubmit={submit} noValidate>
        <fieldset className="form-stack">
          <legend>{t("accountDetails")}</legend>
          <div className="form-grid">
            <TextField
              label="username"
              input={{ id: "asst-username", autoCapitalize: "none", ...register("username") }}
              error={errors.username?.message}
            />
            <TextField
              label="temporaryPassword"
              hint="temporaryPasswordHint"
              input={{ id: "asst-password", autoComplete: "off", ...register("temporaryPassword") }}
              error={errors.temporaryPassword?.message}
            />
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setValue("temporaryPassword", generateTemporaryPassword(), { shouldValidate: true })
              }
            >
              {t("generatePassword")}
            </Button>
          </div>
        </fieldset>
        <FarmerFields form={form} />
        <fieldset className="form-stack">
          <legend>{t("consent")}</legend>
          <label className="check-row">
            <input type="checkbox" {...register("consent")} />
            {t("assistedConsent")}
          </label>
          {errors.consent?.message && (
            <p role="alert" className="field-error">
              {t(errors.consent.message)}
            </p>
          )}
        </fieldset>
        {errors.root?.message && (
          <p role="alert" className="form-alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("registerFarmer")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/assisted-registration">{t("cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
export function AssistedDetailPage() {
  const { t } = useTranslation();
  const { farmerId = "" } = useParams();
  const query = useQuery({
    queryKey: ["assisted-farmer", farmerId],
    queryFn: ({ signal }) => assistedApi.get(farmerId, signal),
    retry: false,
  });
  if (query.isPending) return <FullPageLoader />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  return (
    <div className="dashboard-content">
      <PageHeader title={query.data.fullName}>
        <Button asChild>
          <Link to={`/admin/assisted-registration/${farmerId}/plots/new`}>{t("addPlot")}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/admin/assisted-registration">{t("back")}</Link>
        </Button>
      </PageHeader>
      <FarmerSummary farmer={query.data} />
    </div>
  );
}
export function AssistedPlotNewPage() {
  const { t } = useTranslation();
  const { farmerId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["assisted-farmer", farmerId],
    queryFn: ({ signal }) => assistedApi.get(farmerId, signal),
    retry: false,
  });
  if (query.isPending) return <FullPageLoader />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  const farmer = query.data;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("addPlot")} description={farmer.fullName} />
      <section className="panel dashboard-section">
        <PlotForm
          geo={{
            districtId: farmer.district.id,
            mandalId: farmer.mandal.id,
            villageId: farmer.village.id,
          }}
          cancelTo={"/admin/assisted-registration/" + farmerId}
          onSubmit={async (payload) => {
            await assistedApi.addPlot(farmerId, payload);
            await queryClient.invalidateQueries({ queryKey: ["assisted-farmer", farmerId] });
            toast.success(t("changesSaved"));
            navigate("/admin/assisted-registration/" + farmerId);
          }}
        />
      </section>
    </div>
  );
}
