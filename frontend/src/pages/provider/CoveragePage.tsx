import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { coverageApi } from "@/api/operations.api";
import { ErrorState, FullPageLoader, LoadingSpinner, PageHeader } from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { emptyGeo, GeoSelect, type GeoNames, type GeoValue } from "@/components/forms/GeoSelect";
import {
  defaultWeek,
  rowInvalid,
  TimeRangeRow,
  type DayRow,
} from "@/components/forms/TimeRangeRow";
import { ProviderStatusBadge, RemarkNotice } from "@/components/provider/ProviderParts";
import { Button } from "@/components/ui/button";
import { errorKey } from "@/features/auth/errors";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { profileMissing, providerKey, useProviderMe } from "@/pages/provider/ProviderPages";
import type { CoverageArea, CoveragePayload } from "@/types/operations";
import type { Provider } from "@/types/provider";

type Picked = { key: string; kind: "mandal" | "village"; id: string; label: string };

function CoverageSection({ provider, locked }: { provider: Provider; locked: boolean }) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const queryClient = useQueryClient();
  const toPicked = (a: CoverageArea): Picked =>
    a.village
      ? {
          key: "v" + a.village.id,
          kind: "village",
          id: a.village.id,
          label: `${name(a.village)}, ${name(a.village.mandal)}`,
        }
      : { key: "m" + a.mandal!.id, kind: "mandal", id: a.mandal!.id, label: name(a.mandal!) };
  const [mode, setMode] = useState<"RADIUS" | "AREAS">(provider.coverage.mode ?? "RADIUS");
  const [radius, setRadius] = useState(
    provider.coverage.radiusKm ? String(provider.coverage.radiusKm) : "",
  );
  const [picked, setPicked] = useState<Picked[]>(provider.coverage.areas.map(toPicked));
  const [geo, setGeo] = useState<GeoValue>(emptyGeo);
  const [names, setNames] = useState<GeoNames>({ district: "", mandal: "", village: "" });
  const radiusOk = /^\d+$/.test(radius) && Number(radius) >= 1 && Number(radius) <= 100;
  const valid = mode === "RADIUS" ? radiusOk : picked.length > 0;
  const add = (kind: "mandal" | "village") => {
    const id = kind === "mandal" ? geo.mandalId : geo.villageId;
    if (!id || picked.some((p) => p.key === kind[0] + id)) return;
    const label = kind === "mandal" ? names.mandal : `${names.village}, ${names.mandal}`;
    setPicked([...picked, { key: kind[0] + id, kind, id, label }]);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload: CoveragePayload =
        mode === "RADIUS"
          ? { mode, radiusKm: Number(radius) }
          : {
              mode,
              areas: picked.map((p) =>
                p.kind === "mandal" ? { mandalId: p.id } : { villageId: p.id },
              ),
            };
      return coverageApi.saveCoverage(payload);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(providerKey, saved);
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
      toast.success(t("changesSaved"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  return (
    <section className="panel dashboard-section form-stack">
      <h2>{t("serviceCoverage")}</h2>
      <fieldset className="form-stack" disabled={locked}>
        <div className="check-group" role="radiogroup" aria-label={t("serviceCoverage")}>
          {(["RADIUS", "AREAS"] as const).map((value) => (
            <label key={value} className="check-row">
              <input
                type="radio"
                name="coverage-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {t("coverage_" + value)}
            </label>
          ))}
        </div>
        {mode === "RADIUS" ? (
          <TextField
            label="radiusKm"
            hint="radiusHint"
            input={{
              id: "cov-radius",
              inputMode: "numeric",
              value: radius,
              onChange: (e) => setRadius(e.target.value),
            }}
            error={radius && !radiusOk ? "radiusInvalid" : undefined}
          />
        ) : (
          <div className="form-stack">
            <div className="form-grid">
              <GeoSelect
                idPrefix="cov-geo"
                value={geo}
                onChange={(next, picked) => {
                  setGeo(next);
                  setNames(picked);
                }}
              />
            </div>
            <div className="inline-actions">
              <Button
                type="button"
                variant="outline"
                size="small"
                disabled={!geo.mandalId}
                onClick={() => add("mandal")}
              >
                {t("addMandal")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="small"
                disabled={!geo.villageId}
                onClick={() => add("village")}
              >
                {t("addVillage")}
              </Button>
            </div>
            {picked.length === 0 ? (
              <p className="muted">{t("noAreas")}</p>
            ) : (
              <ul className="chip-list">
                {picked.map((p) => (
                  <li key={p.key} className="chip">
                    <span>
                      {t(p.kind === "mandal" ? "mandal" : "village")}: {p.label}
                    </span>
                    <button
                      type="button"
                      aria-label={t("removeArea", { name: p.label })}
                      onClick={() => setPicked(picked.filter((x) => x.key !== p.key))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </fieldset>
      {!locked && (
        <div className="form-actions">
          <Button
            disabled={!valid || save.isPending}
            aria-busy={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <LoadingSpinner />}
            {t("save")}
          </Button>
        </div>
      )}
    </section>
  );
}
function HoursSection({ provider, locked }: { provider: Provider; locked: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DayRow[]>(() =>
    defaultWeek().map((row) => {
      const saved = provider.workingHours.find((h) => h.weekday === row.weekday);
      return saved ? { ...row, enabled: true, start: saved.start, end: saved.end } : row;
    }),
  );
  const enabled = rows.filter((r) => r.enabled);
  const valid = enabled.length > 0 && !enabled.some(rowInvalid);
  const save = useMutation({
    mutationFn: () =>
      coverageApi.saveHours(enabled.map(({ weekday, start, end }) => ({ weekday, start, end }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerKey });
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
      toast.success(t("changesSaved"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  return (
    <section className="panel dashboard-section form-stack">
      <h2>{t("workingHours")}</h2>
      <p className="muted">{t("workingHoursHint")}</p>
      <div className="form-stack">
        {rows.map((row) => (
          <TimeRangeRow
            key={row.weekday}
            row={row}
            disabled={locked}
            onChange={(next) => setRows(rows.map((r) => (r.weekday === next.weekday ? next : r)))}
          />
        ))}
      </div>
      {!locked && (
        <div className="form-actions">
          <Button
            disabled={!valid || save.isPending}
            aria-busy={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <LoadingSpinner />}
            {t("save")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function CoveragePage() {
  const { t } = useTranslation();
  const me = useProviderMe();
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  const provider = me.data;
  const locked = !provider.editable.coverage;
  const remarks = provider.status === "RETURNED" ? provider.latestReturn?.fieldRemarks : null;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("coverageAndHours")} description={t("coverageIntro")}>
        <ProviderStatusBadge status={provider.status} />
      </PageHeader>
      {locked && <p className="dash-notice">{t("coverageLocked")}</p>}
      <RemarkNotice text={remarks?.coverage} />
      <CoverageSection
        key={"c" + provider.status + provider.coverage.areas.length}
        provider={provider}
        locked={locked}
      />
      <RemarkNotice text={remarks?.workingHours} />
      <HoursSection
        key={"h" + provider.status + provider.workingHours.length}
        provider={provider}
        locked={locked}
      />
    </div>
  );
}
