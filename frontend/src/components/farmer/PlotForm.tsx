import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { farmersApi } from "@/api/farmers.api";
import { LoadingSpinner } from "@/components/common/shared";
import { FormField, SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/AuthFields";
import { GeoSelect, type GeoValue } from "@/components/forms/GeoSelect";
import { LocationField } from "@/components/forms/LocationField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { plotFormSchema, type PlotFormValues } from "@/schemas/farmer";
import type { Plot, PlotPayload } from "@/types/farmer";

const seasons = ["KHARIF", "RABI", "SUMMER"] as const;

export function plotValues(plot: Plot | undefined, geo: GeoValue): PlotFormValues {
  return plot
    ? {
        surveyNo: plot.surveyNo,
        extentAcres: plot.extentAcres,
        districtId: plot.village.districtId,
        mandalId: plot.village.mandalId,
        villageId: plot.village.id,
        latitude: plot.latitude,
        longitude: plot.longitude,
        crops: plot.crops.map((c) => ({
          cropId: c.crop.id,
          season: c.season,
          year: String(c.year),
        })),
      }
    : {
        surveyNo: "",
        extentAcres: "",
        ...geo,
        latitude: "",
        longitude: "",
        crops: [],
      };
}
const toPayload = (v: PlotFormValues): PlotPayload => ({
  surveyNo: v.surveyNo.trim(),
  extentAcres: Number(v.extentAcres),
  villageId: v.villageId,
  latitude: Number(v.latitude),
  longitude: Number(v.longitude),
  crops: v.crops.map((c) => ({ cropId: c.cropId, season: c.season, year: Number(c.year) })),
});

/**
 * Plot create/edit form. For a new plot `geo` supplies the starting district/mandal/village
 * (the farmer's own); an existing plot starts from its own village.
 */
export function PlotForm({
  plot,
  geo,
  onSubmit,
  cancelTo,
  secondary,
}: {
  plot?: Plot;
  geo: GeoValue;
  onSubmit: (payload: PlotPayload) => Promise<void>;
  cancelTo: string;
  secondary?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const crops = useQuery({ queryKey: ["crops"], queryFn: farmersApi.crops, staleTime: 3_600_000 });
  const form = useForm<PlotFormValues>({
    resolver: zodResolver(plotFormSchema),
    defaultValues: plotValues(plot, geo),
  });
  const {
    register,
    control,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const list = useFieldArray({ control, name: "crops" });
  const [districtId, mandalId, villageId, latitude, longitude] = useWatch({
    control,
    name: ["districtId", "mandalId", "villageId", "latitude", "longitude"],
  });
  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toPayload(values));
    } catch (error) {
      if (
        !applyServerErrors(error, setError, [
          "surveyNo",
          "extentAcres",
          "villageId",
          "latitude",
          "longitude",
          "crops",
        ])
      )
        setError("root", { message: errorKey(error) });
    }
  });
  const cropName = (id: string) => {
    const crop = crops.data?.find((c) => c.id === id);
    return crop ? (i18n.language === "te" && crop.nameTe) || crop.nameEn : "";
  };
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <TextField
          label="surveyNo"
          input={{ id: "plot-survey", ...register("surveyNo") }}
          error={errors.surveyNo?.message}
        />
        <TextField
          label="extentAcres"
          input={{ id: "plot-extent", inputMode: "decimal", ...register("extentAcres") }}
          error={errors.extentAcres?.message}
        />
        <GeoSelect
          idPrefix="plot-geo"
          value={{ districtId, mandalId, villageId }}
          onChange={(next) => {
            setValue("districtId", next.districtId, { shouldValidate: true });
            setValue("mandalId", next.mandalId, { shouldValidate: true });
            setValue("villageId", next.villageId, { shouldValidate: true });
          }}
          errors={{
            districtId: errors.districtId?.message,
            mandalId: errors.mandalId?.message,
            villageId: errors.villageId?.message,
          }}
        />
      </div>
      <LocationField
        idPrefix="plot-loc"
        value={{ latitude, longitude }}
        onChange={(next) => {
          setValue("latitude", next.latitude, { shouldValidate: true });
          setValue("longitude", next.longitude, { shouldValidate: true });
        }}
        errors={{ latitude: errors.latitude?.message, longitude: errors.longitude?.message }}
      />
      <fieldset className="form-stack">
        <legend>{t("cropsGrown")}</legend>
        {list.fields.map((field, index) => (
          <div className="form-grid crop-row" key={field.id}>
            <FormField
              id={`crop-${index}`}
              label={t("crop")}
              error={errors.crops?.[index]?.cropId?.message ? t("required") : undefined}
            >
              <SelectField id={`crop-${index}`} {...register(`crops.${index}.cropId`)}>
                <option value="">{t("choose")}</option>
                {crops.data?.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {cropName(crop.id)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField id={`season-${index}`} label={t("season")}>
              <SelectField id={`season-${index}`} {...register(`crops.${index}.season`)}>
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField
              id={`year-${index}`}
              label={t("year")}
              error={errors.crops?.[index]?.year?.message ? t("yearInvalid") : undefined}
            >
              <Input
                id={`year-${index}`}
                inputMode="numeric"
                {...register(`crops.${index}.year`)}
              />
            </FormField>
            <Button type="button" variant="ghost" onClick={() => list.remove(index)}>
              {t("remove")}
            </Button>
          </div>
        ))}
        {errors.crops?.message && (
          <p role="alert" className="field-error">
            {t(errors.crops.message)}
          </p>
        )}
        {list.fields.length < 10 && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={() =>
                list.append({
                  cropId: "",
                  season: "KHARIF",
                  year: String(new Date().getFullYear()),
                })
              }
            >
              {t("addCrop")}
            </Button>
          </div>
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
          {t("save")}
        </Button>
        <Button variant="outline" asChild>
          <Link to={cancelTo}>{t("cancel")}</Link>
        </Button>
        {secondary}
      </div>
    </form>
  );
}
