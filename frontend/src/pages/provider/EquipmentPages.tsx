import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { equipmentApi } from "@/api/equipment.api";
import type { FileRef } from "@/api/files.api";
import { DataTable, type Column } from "@/components/common/DataTable";
import {
  EmptyState,
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { MultiPhotoField } from "@/components/forms/MultiPhotoField";
import {
  detailsFrom,
  emptyDetails,
  EquipmentFields,
  toEquipmentPayload,
  useCategories,
} from "@/components/provider/EquipmentFields";
import { RemarkNotice } from "@/components/provider/ProviderParts";
import { ServiceForm } from "@/components/provider/ServiceForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { useFileObjectUrl } from "@/hooks/useFileObjectUrl";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { profileMissing, useProviderMe } from "@/pages/provider/ProviderPages";
import {
  equipmentDetailsSchema,
  equipmentWizardSchema,
  type EquipmentDetailsValues,
  type EquipmentWizardValues,
} from "@/schemas/equipment";
import type { EquipmentDetail, EquipmentSummary, Service, Unit } from "@/types/equipment";
import { paiseToRupees } from "@/utils/money";

const listKey = ["provider-equipment"] as const;
const detailKey = (id?: string) => ["provider-equipment", id] as const;
const refreshChecklist = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ["provider-checklist"] });
  void qc.invalidateQueries({ queryKey: ["provider-documents"] });
  void qc.invalidateQueries({ queryKey: ["provider-me"] });
};

function Thumb({ file }: { file: FileRef | null }) {
  const { src } = useFileObjectUrl(file?.url);
  return src ? (
    <img className="photo-thumb" src={src} alt={file?.originalName ?? ""} />
  ) : (
    <span className="photo-thumb photo-thumb-empty">—</span>
  );
}

export function EquipmentListPage() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const me = useProviderMe();
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => equipmentApi.list(signal),
    enabled: me.isSuccess,
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError || list.isError)
    return <ErrorState title={t("error")} retry={() => void list.refetch()} />;
  const editable = me.data.editable.equipment;
  const columns: Column<EquipmentSummary>[] = [
    { key: "photo", header: "photo", render: (e) => <Thumb file={e.firstPhoto} /> },
    {
      key: "name",
      header: "equipmentName",
      render: (e) => (
        <Link className="text-link" to={"/provider/equipment/" + e.id}>
          {e.make} {e.model} ({e.year})
        </Link>
      ),
    },
    { key: "category", header: "equipmentCategory", render: (e) => name(e.category) },
    { key: "units", header: "units", render: (e) => e.unitCount },
    { key: "services", header: "rateCard", render: (e) => e.serviceCount },
    {
      key: "status",
      header: "status",
      render: (e) => (
        <StatusBadge tone={e.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + e.status)}
        </StatusBadge>
      ),
    },
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("myEquipment")} description={t("equipmentIntro")}>
        {editable && (
          <Button asChild>
            <Link to="/provider/equipment/new">{t("addEquipment")}</Link>
          </Button>
        )}
      </PageHeader>
      <section className="panel dashboard-section">
        {list.isPending ? (
          <FullPageLoader />
        ) : list.data.length ? (
          <DataTable columns={columns} rows={list.data} empty={t("noEquipment")} />
        ) : (
          <EmptyState title={t("noEquipment")} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------ create wizard ------------------------------ */

export function EquipmentNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const [step, setStep] = useState<1 | 2>(1);
  const [photos, setPhotos] = useState<FileRef[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const form = useForm<EquipmentWizardValues>({
    resolver: zodResolver(equipmentWizardSchema),
    defaultValues: { ...emptyDetails, numberOfUnits: "1" },
  });
  const {
    register,
    trigger,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  if (!me.data.editable.equipment) return <Navigate to="/provider/equipment" replace />;
  const next = async () => {
    const ok = await trigger([
      "categoryId",
      "make",
      "model",
      "year",
      "capacityValue",
      "capacityUnit",
      "implementsText",
    ]);
    if (ok) setStep(2);
  };
  const submit = handleSubmit(async (values) => {
    if (photos.length < 1) return setPhotoError("photosRequired");
    try {
      const created = await equipmentApi.create({
        ...toEquipmentPayload(values, false),
        numberOfUnits: Number(values.numberOfUnits),
        photoFileIds: photos.map((p) => p.id),
      });
      await queryClient.invalidateQueries({ queryKey: listKey });
      refreshChecklist(queryClient);
      toast.success(t("equipmentCreated"));
      navigate(`/provider/equipment/${created.id}?tab=rates`);
    } catch (error) {
      if (!applyServerErrors(error, setError)) setError("root", { message: errorKey(error) });
    }
  });
  return (
    <div className="dashboard-content">
      <PageHeader title={t("addEquipment")} description={t("wizardStep", { step, total: 2 })} />
      <form className="panel dashboard-section form-stack" onSubmit={submit} noValidate>
        {step === 1 ? (
          <>
            <EquipmentFields form={form} />
            <div className="form-actions">
              <Button type="button" onClick={() => void next()}>
                {t("continue")}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/provider/equipment">{t("cancel")}</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <TextField
              label="numberOfUnits"
              hint="numberOfUnitsHint"
              input={{ id: "eq-units", inputMode: "numeric", ...register("numberOfUnits") }}
              error={errors.numberOfUnits?.message}
            />
            <MultiPhotoField
              id="eq-photos"
              label={t("equipmentPhotos")}
              value={photos}
              onChange={(next) => {
                setPhotos(next);
                setPhotoError(null);
              }}
              error={photoError ?? undefined}
            />
            {errors.root?.message && (
              <p role="alert" className="form-alert">
                {t(errors.root.message)}
              </p>
            )}
            <div className="form-actions">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting && <LoadingSpinner />}
                {t("createEquipment")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                {t("back")}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/* ------------------------------- detail tabs ------------------------------- */

type Tab = "details" | "photos" | "units" | "rates";
const tabs: Tab[] = ["details", "photos", "units", "rates"];

function DetailsTab({ equipment, locked }: { equipment: EquipmentDetail; locked: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useForm<EquipmentDetailsValues>({
    resolver: zodResolver(equipmentDetailsSchema),
    defaultValues: detailsFrom(equipment),
  });
  const {
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const toggle = useMutation({
    mutationFn: () => equipmentApi.setActive(equipment.id, equipment.status !== "ACTIVE"),
    onSuccess: (updated) => {
      queryClient.setQueryData(detailKey(equipment.id), updated);
      void queryClient.invalidateQueries({ queryKey: listKey });
      refreshChecklist(queryClient);
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const submit = handleSubmit(async (values) => {
    try {
      const updated = await equipmentApi.update(equipment.id, toEquipmentPayload(values, true));
      queryClient.setQueryData(detailKey(equipment.id), updated);
      void queryClient.invalidateQueries({ queryKey: listKey });
      refreshChecklist(queryClient);
      toast.success(t("changesSaved"));
    } catch (error) {
      if (!applyServerErrors(error, setError)) setError("root", { message: errorKey(error) });
    }
  });
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <EquipmentFields form={form} disabled={locked} />
      {errors.root?.message && (
        <p role="alert" className="form-alert">
          {t(errors.root.message)}
        </p>
      )}
      {!locked && (
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {t(equipment.status === "ACTIVE" ? "deactivate" : "activate")}
          </Button>
        </div>
      )}
    </form>
  );
}

function PhotosTab({ equipment, locked }: { equipment: EquipmentDetail; locked: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<FileRef[]>(equipment.photos);
  const save = useMutation({
    mutationFn: () =>
      equipmentApi.setPhotos(
        equipment.id,
        photos.map((p) => p.id),
      ),
    onSuccess: (saved) => {
      setPhotos(saved);
      void queryClient.invalidateQueries({ queryKey: detailKey(equipment.id) });
      void queryClient.invalidateQueries({ queryKey: listKey });
      refreshChecklist(queryClient);
      toast.success(t("changesSaved"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  return (
    <div className="form-stack">
      <MultiPhotoField
        id="eq-photos"
        label={t("equipmentPhotos")}
        value={photos}
        onChange={setPhotos}
        disabled={locked}
      />
      {!locked && (
        <div className="form-actions">
          <Button disabled={save.isPending || photos.length < 1} onClick={() => save.mutate()}>
            {save.isPending && <LoadingSpinner />}
            {t("save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function UnitRow({
  equipment,
  unit,
  locked,
}: {
  equipment: EquipmentDetail;
  unit: Unit;
  locked: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [registration, setRegistration] = useState(unit.registrationNo ?? "");
  const [uin, setUin] = useState(unit.droneUin ?? "");
  const [error, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof equipmentApi.updateUnit>[2]) =>
      equipmentApi.updateUnit(equipment.id, unit.id, patch),
    onSuccess: () => {
      setErr(null);
      void queryClient.invalidateQueries({ queryKey: detailKey(equipment.id) });
      toast.success(t("changesSaved"));
    },
    onError: (e) => setErr(errorKey(e) === "validation" ? "unitRegistrationInvalid" : errorKey(e)),
  });
  const drone = equipment.category.requiresPilotLicence;
  return (
    <tr>
      <td>{unit.unitLabel}</td>
      <td>
        <Input
          aria-label={t("registrationNumber")}
          value={registration}
          disabled={locked}
          placeholder="TS09AB1234"
          onChange={(e) => setRegistration(e.target.value)}
        />
      </td>
      {drone && (
        <td>
          <Input
            aria-label={t("droneUin")}
            value={uin}
            disabled={locked}
            onChange={(e) => setUin(e.target.value)}
          />
        </td>
      )}
      <td>
        <StatusBadge tone={unit.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + unit.status)}
        </StatusBadge>
      </td>
      <td>
        {!locked && (
          <div className="inline-actions">
            <Button
              size="small"
              variant="outline"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  registrationNo: registration.trim() || null,
                  ...(drone ? { droneUin: uin.trim() || null } : {}),
                })
              }
            >
              {t("save")}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ status: unit.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
              }
            >
              {t(unit.status === "ACTIVE" ? "deactivate" : "activate")}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="field-error">
            {t(error)}
          </p>
        )}
      </td>
    </tr>
  );
}
function UnitsTab({ equipment, locked }: { equipment: EquipmentDetail; locked: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [count, setCount] = useState("1");
  const add = useMutation({
    mutationFn: () => equipmentApi.addUnits(equipment.id, Number(count)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(equipment.id) });
      void queryClient.invalidateQueries({ queryKey: listKey });
      refreshChecklist(queryClient);
      toast.success(t("unitsAdded"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const drone = equipment.category.requiresPilotLicence;
  const valid = /^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= 20;
  return (
    <div className="form-stack">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("unit")}</th>
              <th scope="col">{t("registrationNumber")}</th>
              {drone && <th scope="col">{t("droneUin")}</th>}
              <th scope="col">{t("status")}</th>
              <th scope="col">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {equipment.units.map((unit) => (
              <UnitRow
                key={unit.id + unit.registrationNo + unit.droneUin + unit.status}
                equipment={equipment}
                unit={unit}
                locked={locked}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="filter-row">
          <TextField
            label="addUnitsCount"
            input={{
              id: "add-units",
              inputMode: "numeric",
              value: count,
              onChange: (e) => setCount(e.target.value),
            }}
          />
          <Button disabled={!valid || add.isPending} onClick={() => add.mutate()}>
            {t("addUnits")}
          </Button>
        </div>
      )}
    </div>
  );
}

function RateCardTab({ equipment, locked }: { equipment: EquipmentDetail; locked: boolean }) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const category = categories.data?.find((c) => c.id === equipment.category.id);
  const active = equipment.services.filter((s) => s.isActive);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey(equipment.id) });
    void queryClient.invalidateQueries({ queryKey: listKey });
    refreshChecklist(queryClient);
  };
  const remove = useMutation({
    mutationFn: (id: string) => equipmentApi.removeService(equipment.id, id),
    onSuccess: refresh,
    onError: (error) => toast.error(t(errorKey(error))),
  });
  if (categories.isPending) return <FullPageLoader />;
  if (!category) return <ErrorState title={t("error")} />;
  const rupees = (p: number | null) => (p === null ? "—" : "₹" + paiseToRupees(p));
  const columns: Column<Service>[] = [
    { key: "op", header: "operation", render: (s) => name(s.operation) },
    {
      key: "rate",
      header: "rateRupees",
      render: (s) => `${rupees(s.ratePaise)} / ${t("basis_" + s.pricingBasis)}`,
    },
    { key: "min", header: "minChargeRupees", render: (s) => rupees(s.minChargePaise) },
    {
      key: "travel",
      header: "travelCharge",
      render: (s) =>
        s.travelMode === "NONE"
          ? t("travel_NONE")
          : s.travelMode === "FLAT"
            ? `${rupees(s.travelFlatPaise)} ${t("flat")}`
            : `${rupees(s.travelPerKmPaise)} / km (${t("freeKm", { km: Number(s.freeRadiusKm ?? 0) })})`,
    },
    { key: "work", header: "workRate", render: (s) => Number(s.workRateAcresPerHour) },
    {
      key: "actions",
      header: "actions",
      render: (s) =>
        locked ? null : (
          <div className="inline-actions">
            <Button size="small" variant="outline" onClick={() => setEditing(s)}>
              {t("edit")}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate(s.id)}
            >
              {t("remove")}
            </Button>
          </div>
        ),
    },
  ];
  return (
    <div className="form-stack">
      {active.length ? (
        <DataTable columns={columns} rows={active} empty={t("noServices")} />
      ) : (
        <EmptyState title={t("noServices")} />
      )}
      {!locked && !editing && (
        <div>
          <Button onClick={() => setEditing("new")}>{t("addService")}</Button>
        </div>
      )}
      {editing && (
        <ServiceForm
          equipmentId={equipment.id}
          category={category}
          usedOperationIds={active.map((s) => s.operation.id)}
          service={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
            toast.success(t("changesSaved"));
          }}
        />
      )}
    </div>
  );
}

export function EquipmentDetailPage() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const { equipmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const me = useProviderMe();
  const query = useQuery({
    queryKey: detailKey(equipmentId),
    queryFn: ({ signal }) => equipmentApi.get(equipmentId!, signal),
    enabled: Boolean(equipmentId) && me.isSuccess,
    retry: false,
  });
  if (me.isPending || query.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  const equipment = query.data;
  const locked = !me.data.editable.equipment;
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : "details";
  const remark =
    me.data.status === "RETURNED"
      ? me.data.latestReturn?.fieldRemarks?.equipment?.[equipment.id]
      : undefined;
  return (
    <div className="dashboard-content">
      <PageHeader
        title={`${equipment.make} ${equipment.model}`}
        description={`${name(equipment.category)} · ${equipment.year}`}
      >
        <StatusBadge tone={equipment.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + equipment.status)}
        </StatusBadge>
        <Button variant="outline" asChild>
          <Link to="/provider/equipment">{t("back")}</Link>
        </Button>
      </PageHeader>
      <RemarkNotice text={remark} />
      {locked && <p className="dash-notice">{t("equipmentLocked")}</p>}
      <div role="tablist" className="tab-list" aria-label={t("myEquipment")}>
        {tabs.map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            className={"tab" + (tab === value ? " active" : "")}
            onClick={() => setParams({ tab: value }, { replace: true })}
          >
            {t("tab_" + value)}
          </button>
        ))}
      </div>
      <section className="panel dashboard-section" role="tabpanel">
        {tab === "details" && (
          <DetailsTab key={equipment.id + equipment.status} equipment={equipment} locked={locked} />
        )}
        {tab === "photos" && <PhotosTab key={equipment.id} equipment={equipment} locked={locked} />}
        {tab === "units" && <UnitsTab equipment={equipment} locked={locked} />}
        {tab === "rates" && <RateCardTab equipment={equipment} locked={locked} />}
      </section>
    </div>
  );
}
