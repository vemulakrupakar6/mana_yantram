import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { equipmentApi } from "@/api/equipment.api";
import { mastersApi } from "@/api/masters.api";
import { rateCapsApi, type RateCap, type RateCapCreate } from "@/api/rate-caps.api";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ErrorState, FullPageLoader, PageHeader, StatusBadge } from "@/components/common/shared";
import { FormField, SelectField } from "@/components/forms/fields";
import { MoneyField } from "@/components/forms/MoneyField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorKey } from "@/features/auth/errors";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { pricingBases, type PricingBasis } from "@/types/equipment";
import { paiseToRupees } from "@/utils/money";

const KEY = ["rate-caps"] as const;

function EnforcementSwitch() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: [...KEY, "enabled"], queryFn: rateCapsApi.enabled });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => rateCapsApi.setEnabled(enabled),
    onSuccess: () => {
      toast.success(t("changesSaved"));
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  if (setting.isError)
    return <ErrorState title={t("error")} retry={() => void setting.refetch()} />;
  if (!setting.data) return <FullPageLoader />;
  const on = setting.data.enabled;
  return (
    <section className="panel dashboard-section" aria-labelledby="caps-switch">
      <h2 id="caps-switch">{t("rateCapsEnforcement")}</h2>
      <p className="muted">{t("rateCapsEnforcementHelp")}</p>
      <p>
        <StatusBadge tone={on ? "success" : "neutral"}>
          {t(on ? "rateCapsOn" : "rateCapsOff")}
        </StatusBadge>
      </p>
      <ConfirmDialog
        trigger={
          <Button variant={on ? "outline" : "default"} disabled={toggle.isPending}>
            {t(on ? "disableRateCaps" : "enableRateCaps")}
          </Button>
        }
        title={t(on ? "disableRateCaps" : "enableRateCaps")}
        description={t(on ? "disableRateCapsBody" : "enableRateCapsBody")}
        action={t(on ? "disableRateCaps" : "enableRateCaps")}
        onConfirm={() => toggle.mutate(!on)}
      />
    </section>
  );
}

function AddCapForm() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["categories"], queryFn: equipmentApi.categories });
  const districts = useQuery({ queryKey: ["districts"], queryFn: mastersApi.districts });
  const [categoryId, setCategoryId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [basis, setBasis] = useState<PricingBasis>("ACRE");
  const [max, setMax] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const operations = categories.data?.find((c) => c.id === categoryId)?.operations ?? [];
  const create = useMutation({
    mutationFn: (payload: RateCapCreate) => rateCapsApi.create(payload),
    onSuccess: () => {
      toast.success(t("capAdded"));
      setMessage(null);
      setMax(null);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => setMessage(errorKey(error)),
  });
  const ready = Boolean(categoryId && operationId && max && max >= 100);
  return (
    <form
      className="form-stack panel dashboard-section"
      aria-label={t("addCap")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return setMessage("capIncomplete");
        create.mutate({
          categoryId,
          operationId,
          pricingBasis: basis,
          maxRatePaise: max!,
          ...(districtId ? { districtId } : {}),
        });
      }}
      noValidate
    >
      <h2>{t("addCap")}</h2>
      <div className="form-grid">
        <FormField id="cap-category" label={t("categoryLabel")}>
          <SelectField
            id="cap-category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setOperationId("");
            }}
          >
            <option value="">{t("choose")}</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField id="cap-operation" label={t("operation")}>
          <SelectField
            id="cap-operation"
            value={operationId}
            onChange={(event) => {
              setOperationId(event.target.value);
              const op = operations.find((o) => o.id === event.target.value);
              if (op?.defaultPricingBasis) setBasis(op.defaultPricingBasis);
            }}
          >
            <option value="">{t("choose")}</option>
            {operations.map((o) => (
              <option key={o.id} value={o.id}>
                {name(o)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField id="cap-district" label={t("capScope")}>
          <SelectField
            id="cap-district"
            value={districtId}
            onChange={(event) => setDistrictId(event.target.value)}
          >
            <option value="">{t("statewide")}</option>
            {districts.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {name(d)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField id="cap-basis" label={t("pricingBasis")}>
          <SelectField
            id="cap-basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value as PricingBasis)}
          >
            {pricingBases.map((b) => (
              <option key={b} value={b}>
                {t("basis_" + b)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <MoneyField id="cap-max" label={t("maxRateRupees")} value={max} onChange={setMax} />
      </div>
      {message && (
        <p role="alert" className="form-alert">
          {t(message)}
        </p>
      )}
      <div className="form-actions">
        <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
          {t("addCap")}
        </Button>
      </div>
    </form>
  );
}

function CapActions({ cap }: { cap: RateCap }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(cap.maxRatePaise);
  const update = useMutation({
    mutationFn: (patch: { maxRatePaise?: number; isActive?: boolean }) =>
      rateCapsApi.update(cap.id, patch),
    onSuccess: () => {
      toast.success(t("capSaved"));
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <MoneyField
            id={"cap-edit-" + cap.id}
            label={t("maxRateRupees")}
            value={value}
            onChange={setValue}
          />
          <Button
            disabled={!value || value < 100 || update.isPending}
            onClick={() => update.mutate({ maxRatePaise: value! })}
          >
            {t("save")}
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>
            {t("cancel")}
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ isActive: !cap.isActive })}
          >
            {t(cap.isActive ? "deactivate" : "reactivate")}
          </Button>
        </>
      )}
    </div>
  );
}

export function RateCapsPage() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const caps = useQuery({ queryKey: [...KEY, "list"], queryFn: () => rateCapsApi.list(1, 100) });
  const columns: Column<RateCap>[] = [
    { key: "category", header: "categoryLabel", render: (c) => name(c.category) },
    { key: "operation", header: "operation", render: (c) => name(c.operation) },
    {
      key: "scope",
      header: "capScope",
      render: (c) => (c.district ? name(c.district) : t("statewide")),
    },
    { key: "basis", header: "pricingBasis", render: (c) => t("basis_" + c.pricingBasis) },
    { key: "max", header: "maxRateRupees", render: (c) => "₹" + paiseToRupees(c.maxRatePaise) },
    {
      key: "state",
      header: "capState",
      render: (c) => (
        <StatusBadge tone={c.isActive ? "success" : "neutral"}>
          {t(c.isActive ? "capActive" : "capInactive")}
        </StatusBadge>
      ),
    },
    { key: "actions", header: "capActions", render: (c) => <CapActions cap={c} /> },
  ];
  return (
    <>
      <PageHeader title={t("rateCapsTitle")} description={t("rateCapsDescription")} />
      <EnforcementSwitch />
      <AddCapForm />
      <section className="dashboard-section" aria-labelledby="caps-list">
        <h2 id="caps-list">{t("capsHeading")}</h2>
        {caps.isError ? (
          <ErrorState title={t("error")} retry={() => void caps.refetch()} />
        ) : !caps.data ? (
          <FullPageLoader />
        ) : (
          <DataTable columns={columns} rows={caps.data.items} empty={t("noCaps")} />
        )}
      </section>
    </>
  );
}
