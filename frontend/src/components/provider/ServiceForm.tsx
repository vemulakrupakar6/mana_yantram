import { useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { equipmentApi } from "@/api/equipment.api";
import { rateCapsApi } from "@/api/rate-caps.api";
import { LoadingSpinner } from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { FormField, SelectField } from "@/components/forms/fields";
import { MoneyField } from "@/components/forms/MoneyField";
import { Button } from "@/components/ui/button";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { paiseToRupees } from "@/utils/money";
import { serviceFormSchema, type ServiceFormValues } from "@/schemas/equipment";
import {
  pricingBases,
  travelModes,
  type Category,
  type Service,
  type ServicePayload,
} from "@/types/equipment";

const blank = (category: Category): ServiceFormValues => ({
  operationId: "",
  pricingBasis: category.operations[0]?.defaultPricingBasis ?? "ACRE",
  ratePaise: null,
  minChargePaise: 0,
  travelMode: "NONE",
  travelFlatPaise: null,
  travelPerKmPaise: null,
  freeRadiusKm: "",
  workRateAcresPerHour: "",
});
const fromService = (s: Service): ServiceFormValues => ({
  operationId: s.operation.id,
  pricingBasis: s.pricingBasis,
  ratePaise: s.ratePaise,
  minChargePaise: s.minChargePaise,
  travelMode: s.travelMode,
  travelFlatPaise: s.travelFlatPaise,
  travelPerKmPaise: s.travelPerKmPaise,
  freeRadiusKm: s.freeRadiusKm ? String(Number(s.freeRadiusKm)) : "",
  workRateAcresPerHour: String(Number(s.workRateAcresPerHour)),
});
export function toServicePayload(v: ServiceFormValues): ServicePayload {
  return {
    operationId: v.operationId,
    pricingBasis: v.pricingBasis,
    ratePaise: v.ratePaise!,
    minChargePaise: v.minChargePaise ?? 0,
    travelMode: v.travelMode,
    ...(v.travelMode === "FLAT" ? { travelFlatPaise: v.travelFlatPaise! } : {}),
    ...(v.travelMode === "PER_KM"
      ? {
          travelPerKmPaise: v.travelPerKmPaise!,
          ...(v.freeRadiusKm.trim() ? { freeRadiusKm: Number(v.freeRadiusKm) } : {}),
        }
      : {}),
    workRateAcresPerHour: Number(v.workRateAcresPerHour),
  };
}

/** Add (no `service`) or edit one rate-card line for a piece of equipment. */
export function ServiceForm({
  equipmentId,
  category,
  usedOperationIds,
  service,
  onDone,
  onCancel,
}: {
  equipmentId: string;
  category: Category;
  usedOperationIds: string[];
  service?: Service;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: service ? fromService(service) : blank(category),
  });
  const {
    register,
    control,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const mode = useWatch({ control, name: "travelMode" });
  const operationId = useWatch({ control, name: "operationId" });
  const basis = useWatch({ control, name: "pricingBasis" });
  const capHint = useQuery({
    queryKey: ["rate-cap-hint", category.id, operationId, basis],
    queryFn: () => rateCapsApi.hint({ categoryId: category.id, operationId, pricingBasis: basis }),
    enabled: Boolean(operationId),
    retry: false,
  });
  const cap = capHint.data;
  const capText =
    cap?.enabled && cap.maxRatePaise
      ? t(cap.scope === "DISTRICT" ? "capHintDistrict" : "capHintStatewide", {
          max: paiseToRupees(cap.maxRatePaise),
        })
      : undefined;
  const submit = handleSubmit(async (values) => {
    try {
      const payload = toServicePayload(values);
      if (service) {
        const { operationId: _unused, ...rest } = payload;
        void _unused;
        // Explicit nulls clear the fields of a travel mode that no longer applies.
        await equipmentApi.updateService(equipmentId, service.id, {
          ...rest,
          travelFlatPaise: payload.travelFlatPaise ?? null,
          travelPerKmPaise: payload.travelPerKmPaise ?? null,
          freeRadiusKm: payload.freeRadiusKm ?? null,
        });
      } else await equipmentApi.addService(equipmentId, payload);
      onDone();
    } catch (error) {
      if (!applyServerErrors(error, setError)) setError("root", { message: errorKey(error) });
    }
  });
  const available = category.operations.filter(
    (o) => !usedOperationIds.includes(o.id) || o.id === service?.operation.id,
  );
  return (
    <form className="form-stack panel dashboard-section" onSubmit={submit} noValidate>
      <h3>{t(service ? "editService" : "addService")}</h3>
      <div className="form-grid">
        <FormField
          id="svc-op"
          label={t("operation")}
          error={errors.operationId?.message ? t(errors.operationId.message) : undefined}
        >
          <SelectField
            id="svc-op"
            disabled={Boolean(service)}
            {...register("operationId", {
              onChange: (event) => {
                const op = category.operations.find((o) => o.id === event.target.value);
                if (op?.defaultPricingBasis) setValue("pricingBasis", op.defaultPricingBasis);
              },
            })}
          >
            <option value="">{t("choose")}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {name(o)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField id="svc-basis" label={t("pricingBasis")}>
          <SelectField id="svc-basis" {...register("pricingBasis")}>
            {pricingBases.map((b) => (
              <option key={b} value={b}>
                {t("basis_" + b)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <Controller
          control={control}
          name="ratePaise"
          render={({ field }) => (
            <MoneyField
              id="svc-rate"
              label={t("rateRupees")}
              value={field.value}
              onChange={field.onChange}
              error={errors.ratePaise?.message ? t(errors.ratePaise.message) : undefined}
              hint={capText}
            />
          )}
        />
        <Controller
          control={control}
          name="minChargePaise"
          render={({ field }) => (
            <MoneyField
              id="svc-min"
              label={t("minChargeRupees")}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <TextField
          label="workRate"
          hint="workRateHint"
          input={{ id: "svc-work", inputMode: "decimal", ...register("workRateAcresPerHour") }}
          error={errors.workRateAcresPerHour?.message}
        />
        <FormField id="svc-travel" label={t("travelCharge")}>
          <SelectField id="svc-travel" {...register("travelMode")}>
            {travelModes.map((m) => (
              <option key={m} value={m}>
                {t("travel_" + m)}
              </option>
            ))}
          </SelectField>
        </FormField>
        {mode === "FLAT" && (
          <Controller
            control={control}
            name="travelFlatPaise"
            render={({ field }) => (
              <MoneyField
                id="svc-flat"
                label={t("travelFlatRupees")}
                value={field.value}
                onChange={field.onChange}
                error={
                  errors.travelFlatPaise?.message ? t(errors.travelFlatPaise.message) : undefined
                }
              />
            )}
          />
        )}
        {mode === "PER_KM" && (
          <>
            <Controller
              control={control}
              name="travelPerKmPaise"
              render={({ field }) => (
                <MoneyField
                  id="svc-perkm"
                  label={t("travelPerKmRupees")}
                  value={field.value}
                  onChange={field.onChange}
                  error={
                    errors.travelPerKmPaise?.message
                      ? t(errors.travelPerKmPaise.message)
                      : undefined
                  }
                />
              )}
            />
            <TextField
              label="freeRadiusKm"
              hint="freeRadiusHint"
              input={{ id: "svc-free", inputMode: "decimal", ...register("freeRadiusKm") }}
              error={errors.freeRadiusKm?.message}
            />
          </>
        )}
      </div>
      {errors.root?.message && (
        <p role="alert" className="form-alert">
          {t(errors.root.message)}
        </p>
      )}
      <div className="form-actions">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <LoadingSpinner />}
          {t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
