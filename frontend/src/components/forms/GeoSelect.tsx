import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { mastersApi } from "@/api/masters.api";
import type { GeoItem } from "@/types/admin";
import { FormField, SelectField } from "./fields";

export interface GeoValue {
  districtId: string;
  mandalId: string;
  villageId: string;
}
export interface GeoNames {
  district: string;
  mandal: string;
  village: string;
}
export const emptyGeo: GeoValue = { districtId: "", mandalId: "", villageId: "" };
type Level = "district" | "mandal" | "village";
const hour = 60 * 60 * 1000;

/** Cascading district → mandal → village selects. Changing a parent clears its children. */
export function GeoSelect({
  value,
  onChange,
  upTo = "village",
  idPrefix = "geo",
  disabled,
  errors,
}: {
  value: GeoValue;
  /** `names` are the display names (in the current language) of the selected places. */
  onChange: (value: GeoValue, names: GeoNames) => void;
  upTo?: Level;
  idPrefix?: string;
  disabled?: boolean;
  errors?: Partial<Record<keyof GeoValue, string>>;
}) {
  const { t, i18n } = useTranslation();
  const districts = useQuery({
    queryKey: ["geo", "districts"],
    queryFn: mastersApi.districts,
    staleTime: hour,
  });
  const mandals = useQuery({
    queryKey: ["geo", "mandals", value.districtId],
    queryFn: () => mastersApi.mandals(value.districtId),
    enabled: Boolean(value.districtId) && upTo !== "district",
    staleTime: hour,
  });
  const villages = useQuery({
    queryKey: ["geo", "villages", value.mandalId],
    queryFn: () => mastersApi.villages(value.mandalId),
    enabled: Boolean(value.mandalId) && upTo === "village",
    staleTime: hour,
  });
  const name = (item: GeoItem) => (i18n.language === "te" && item.nameTe) || item.nameEn;
  const select = (
    field: keyof GeoValue,
    label: string,
    items: GeoItem[] | undefined,
    enabled: boolean,
  ) => (
    <FormField
      id={idPrefix + "-" + field}
      label={t(label)}
      error={errors?.[field] ? t(errors[field]!) : undefined}
    >
      <SelectField
        id={idPrefix + "-" + field}
        value={value[field]}
        disabled={disabled || !enabled}
        aria-invalid={Boolean(errors?.[field])}
        onChange={(event) => {
          const next = { ...value, [field]: event.target.value };
          if (field === "districtId") Object.assign(next, { mandalId: "", villageId: "" });
          if (field === "mandalId") next.villageId = "";
          const pick = (items: GeoItem[] | undefined, id: string) => {
            const item = items?.find((i) => i.id === id);
            return item ? name(item) : "";
          };
          onChange(next, {
            district: pick(districts.data, next.districtId),
            mandal: pick(mandals.data, next.mandalId),
            village: pick(villages.data, next.villageId),
          });
        }}
      >
        <option value="">{t("choose")}</option>
        {items?.map((item) => (
          <option key={item.id} value={item.id}>
            {name(item)}
          </option>
        ))}
      </SelectField>
    </FormField>
  );
  return (
    <>
      {select("districtId", "district", districts.data, true)}
      {upTo !== "district" && select("mandalId", "mandal", mandals.data, Boolean(value.districtId))}
      {upTo === "village" && select("villageId", "village", villages.data, Boolean(value.mandalId))}
    </>
  );
}
