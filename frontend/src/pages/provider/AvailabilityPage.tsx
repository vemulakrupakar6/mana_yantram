import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { equipmentApi } from "@/api/equipment.api";
import { availabilityApi } from "@/api/operations.api";
import { DataTable, type Column } from "@/components/common/DataTable";
import {
  EmptyState,
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
} from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { FormField, SelectField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorKey } from "@/features/auth/errors";
import { profileMissing, useProviderMe } from "@/pages/provider/ProviderPages";
import type { AvailabilityBlock } from "@/types/operations";

const blocksKey = ["provider-availability"] as const;
export type BlockCheck = "ok" | "order" | "past" | "long";
/** Client-side mirror of the server rules, so the form can explain a problem before submitting. */
export function checkBlock(startsAt: string, endsAt: string, now = Date.now()): BlockCheck {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "order";
  if (end <= now) return "past";
  if (end - start > 180 * 86_400_000) return "long";
  return "ok";
}

export function AvailabilityPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const equipment = useQuery({
    queryKey: ["provider-equipment"],
    queryFn: ({ signal }) => equipmentApi.list(signal),
    enabled: me.isSuccess,
  });
  const blocks = useQuery({
    queryKey: blocksKey,
    queryFn: ({ signal }) => availabilityApi.list(signal),
    enabled: me.isSuccess,
  });
  const [unitId, setUnitId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      availabilityApi.create(unitId, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setServerError(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: blocksKey });
      toast.success(t("blockAdded"));
    },
    onError: (error) => setServerError(errorKey(error)),
  });
  const remove = useMutation({
    mutationFn: (block: AvailabilityBlock) => availabilityApi.remove(block.unitId, block.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: blocksKey }),
    onError: (error) => toast.error(t(errorKey(error))),
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError || equipment.isError || blocks.isError)
    return <ErrorState title={t("error")} retry={() => void blocks.refetch()} />;
  if (equipment.isPending || blocks.isPending) return <FullPageLoader />;
  const locked = me.data.status === "REJECTED" || me.data.status === "BLACKLISTED";
  const units = equipment.data.flatMap((e) =>
    e.units.map((u) => ({ id: u.id, label: `${e.make} ${e.model} – ${u.unitLabel}` })),
  );
  const check = startsAt && endsAt ? checkBlock(startsAt, endsAt) : null;
  const format = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === "te" ? "te-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  const columns: Column<AvailabilityBlock>[] = [
    {
      key: "unit",
      header: "unit",
      render: (b) => `${b.equipment.make} ${b.equipment.model} – ${b.unitLabel}`,
    },
    { key: "from", header: "blockFrom", render: (b) => format(b.startsAt) },
    { key: "to", header: "blockTo", render: (b) => format(b.endsAt) },
    { key: "reason", header: "reason", render: (b) => b.reason },
    {
      key: "actions",
      header: "actions",
      render: (b) =>
        locked ? null : (
          <Button
            size="small"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate(b)}
          >
            {t("remove")}
          </Button>
        ),
    },
  ];
  const canSubmit =
    Boolean(unitId) && check === "ok" && reason.trim().length >= 3 && !create.isPending;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("availability")} description={t("availabilityIntro")} />
      {!locked && (
        <section className="panel dashboard-section form-stack">
          <h2>{t("blockTime")}</h2>
          {units.length === 0 ? (
            <p className="muted">{t("noUnitsToBlock")}</p>
          ) : (
            <>
              <div className="form-grid">
                <FormField id="blk-unit" label={t("unit")}>
                  <SelectField
                    id="blk-unit"
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                  >
                    <option value="">{t("choose")}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
                <FormField id="blk-from" label={t("blockFrom")}>
                  <Input
                    id="blk-from"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </FormField>
                <FormField
                  id="blk-to"
                  label={t("blockTo")}
                  error={check && check !== "ok" ? t("block_" + check) : undefined}
                >
                  <Input
                    id="blk-to"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </FormField>
                <TextField
                  label="reason"
                  input={{
                    id: "blk-reason",
                    value: reason,
                    maxLength: 200,
                    onChange: (e) => setReason(e.target.value),
                  }}
                />
              </div>
              {serverError && (
                <p role="alert" className="form-alert">
                  {t(serverError)}
                </p>
              )}
              <div className="form-actions">
                <Button
                  disabled={!canSubmit}
                  aria-busy={create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending && <LoadingSpinner />}
                  {t("addBlock")}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      <section className="panel dashboard-section">
        <h2>{t("upcomingBlocks")}</h2>
        {blocks.data.length ? (
          <DataTable columns={columns} rows={blocks.data} empty={t("noBlocks")} />
        ) : (
          <EmptyState title={t("noBlocks")} />
        )}
      </section>
    </div>
  );
}
