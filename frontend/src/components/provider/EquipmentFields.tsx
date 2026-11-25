import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import { equipmentApi } from "@/api/equipment.api";
import { TextField } from "@/components/forms/AuthFields";
import { FormField, SelectField } from "@/components/forms/fields";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { parseImplements, type EquipmentDetailsValues } from "@/schemas/equipment";
import { capacityUnits, type EquipmentDetail, type EquipmentPayload } from "@/types/equipment";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: equipmentApi.categories,
    staleTime: 3_600_000,
  });
}
export const emptyDetails: EquipmentDetailsValues = {
  categoryId: "",
  make: "",
  model: "",
  year: "",
  capacityValue: "",
  capacityUnit: "",
  implementsText: "",
};
export const detailsFrom = (e: EquipmentDetail): EquipmentDetailsValues => ({
  categoryId: e.category.id,
  make: e.make,
  model: e.model,
  year: String(e.year),
  capacityValue: e.capacityValue ? String(Number(e.capacityValue)) : "",
  capacityUnit: e.capacityUnit ?? "",
  implementsText: e.implements.join(", "),
});
/** Editing sends null to clear the capacity; creation simply omits it. */
export function toEquipmentPayload(v: EquipmentDetailsValues, editing: boolean): EquipmentPayload {
  const hasCapacity = Boolean(v.capacityValue.trim());
  return {
    categoryId: v.categoryId,
    make: v.make.trim(),
    model: v.model.trim(),
    year: Number(v.year),
    ...(hasCapacity
      ? { capacityValue: Number(v.capacityValue), capacityUnit: v.capacityUnit || undefined }
      : editing
        ? { capacityValue: null, capacityUnit: null }
        : {}),
    implements: parseImplements(v.implementsText),
  };
}

/** Category, make, model, year, capacity and implements. Generic so the wizard can add fields. */
export function EquipmentFields<T extends EquipmentDetailsValues>({
  form,
  disabled,
}: {
  form: UseFormReturn<T>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const categories = useCategories();
  const f = form as unknown as UseFormReturn<EquipmentDetailsValues>;
  const {
    register,
    formState: { errors },
  } = f;
  return (
    <fieldset className="form-stack" disabled={disabled}>
      <div className="form-grid">
        <FormField
          id="eq-category"
          label={t("equipmentCategory")}
          error={errors.categoryId?.message ? t(errors.categoryId.message) : undefined}
        >
          <SelectField id="eq-category" {...register("categoryId")}>
            <option value="">{t("choose")}</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <TextField
          label="make"
          input={{ id: "eq-make", ...register("make") }}
          error={errors.make?.message}
        />
        <TextField
          label="modelName"
          input={{ id: "eq-model", ...register("model") }}
          error={errors.model?.message}
        />
        <TextField
          label="manufactureYear"
          input={{ id: "eq-year", inputMode: "numeric", ...register("year") }}
          error={errors.year?.message}
        />
        <TextField
          label="capacityOptional"
          input={{ id: "eq-capacity", inputMode: "decimal", ...register("capacityValue") }}
          error={errors.capacityValue?.message}
        />
        <FormField
          id="eq-unit"
          label={t("capacityUnit")}
          error={errors.capacityUnit?.message ? t(errors.capacityUnit.message) : undefined}
        >
          <SelectField id="eq-unit" {...register("capacityUnit")}>
            <option value="">—</option>
            {capacityUnits.map((u) => (
              <option key={u} value={u}>
                {t("unit_" + u)}
              </option>
            ))}
          </SelectField>
        </FormField>
      </div>
      <TextField
        label="implementsOptional"
        hint="implementsHint"
        input={{ id: "eq-implements", ...register("implementsText") }}
        error={errors.implementsText?.message}
      />
    </fieldset>
  );
}
