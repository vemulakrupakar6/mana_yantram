import { useTranslation } from "react-i18next";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { FormField, SelectField } from "@/components/forms/fields";
import { LanguageField, TextField } from "@/components/forms/AuthFields";
import { GeoSelect } from "@/components/forms/GeoSelect";
import { stripSpaces } from "@/utils/aadhaar";
import type { FarmerFormValues } from "@/schemas/farmer";
import type { Farmer, FarmerProfilePayload } from "@/types/farmer";

export const emptyFarmerValues: FarmerFormValues = {
  fullName: "",
  relationType: "FATHER",
  relativeName: "",
  gender: "MALE",
  mobile: "",
  districtId: "",
  mandalId: "",
  villageId: "",
  aadhaarNumber: "",
  removeAadhaar: false,
  preferredLanguage: "en",
  notifySms: true,
  notifyInApp: true,
  notifyPush: true,
};
export function valuesFromFarmer(farmer: Farmer): FarmerFormValues {
  return {
    fullName: farmer.fullName,
    relationType: farmer.relationType,
    relativeName: farmer.relativeName,
    gender: farmer.gender,
    mobile: farmer.mobile ?? "",
    districtId: farmer.district.id,
    mandalId: farmer.mandal.id,
    villageId: farmer.village.id,
    aadhaarNumber: "",
    removeAadhaar: false,
    preferredLanguage: farmer.preferredLanguage,
    notifySms: farmer.notifications.sms,
    notifyInApp: farmer.notifications.inApp,
    notifyPush: farmer.notifications.push,
  };
}
/** `aadhaarNumber`: omitted when blank (unchanged), null when the user asked to remove it. */
export function toProfilePayload(values: FarmerFormValues): FarmerProfilePayload {
  const aadhaar = values.removeAadhaar ? null : values.aadhaarNumber.trim();
  return {
    fullName: values.fullName.trim(),
    relationType: values.relationType,
    relativeName: values.relativeName.trim(),
    gender: values.gender,
    mobile: values.mobile.trim(),
    districtId: values.districtId,
    mandalId: values.mandalId,
    villageId: values.villageId,
    ...(aadhaar === null
      ? { aadhaarNumber: null }
      : aadhaar
        ? { aadhaarNumber: stripSpaces(aadhaar) }
        : {}),
    preferredLanguage: values.preferredLanguage,
    notifications: { sms: values.notifySms, inApp: values.notifyInApp, push: values.notifyPush },
  };
}

/**
 * The personal and location/preference fields, shared by onboarding, profile edit and assisted
 * registration. Generic so a form with extra fields can reuse it.
 */
export function FarmerFields<T extends FarmerFormValues>({
  form,
  existingAadhaar,
}: {
  form: UseFormReturn<T>;
  /** Masked Aadhaar already on file (edit mode). */
  existingAadhaar?: string | null;
}) {
  const { t } = useTranslation();
  const f = form as unknown as UseFormReturn<FarmerFormValues>;
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = f;
  const [districtId, mandalId, villageId] = useWatch({
    control,
    name: ["districtId", "mandalId", "villageId"],
  });
  return (
    <>
      <fieldset className="form-stack">
        <legend>{t("personalDetails")}</legend>
        <div className="form-grid">
          <TextField
            label="fullName"
            input={{ id: "farmer-name", autoComplete: "name", ...register("fullName") }}
            error={errors.fullName?.message}
          />
          <FormField id="farmer-relation" label={t("relationType")}>
            <SelectField id="farmer-relation" {...register("relationType")}>
              <option value="FATHER">{t("FATHER")}</option>
              <option value="HUSBAND">{t("HUSBAND")}</option>
            </SelectField>
          </FormField>
          <TextField
            label="relativeName"
            input={{ id: "farmer-relative", ...register("relativeName") }}
            error={errors.relativeName?.message}
          />
          <FormField id="farmer-gender" label={t("gender")}>
            <SelectField id="farmer-gender" {...register("gender")}>
              <option value="MALE">{t("MALE")}</option>
              <option value="FEMALE">{t("FEMALE")}</option>
              <option value="OTHER">{t("OTHER")}</option>
            </SelectField>
          </FormField>
          <TextField
            label="mobile"
            hint="mobileHint10"
            input={{
              id: "farmer-mobile",
              type: "tel",
              inputMode: "numeric",
              autoComplete: "tel-national",
              ...register("mobile"),
            }}
            error={errors.mobile?.message}
          />
          <TextField
            label="aadhaarOptional"
            hint={existingAadhaar ? "aadhaarKeepHint" : "aadhaarHint"}
            input={{
              id: "farmer-aadhaar",
              inputMode: "numeric",
              autoComplete: "off",
              placeholder: existingAadhaar ?? undefined,
              ...register("aadhaarNumber"),
            }}
            error={errors.aadhaarNumber?.message}
          />
        </div>
        {existingAadhaar && (
          <label className="check-row">
            <input type="checkbox" {...register("removeAadhaar")} />
            {t("removeAadhaar")}
          </label>
        )}
      </fieldset>
      <fieldset className="form-stack">
        <legend>{t("locationAndPreferences")}</legend>
        <div className="form-grid">
          <GeoSelect
            idPrefix="farmer-geo"
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
          <LanguageField id="farmer-language" {...register("preferredLanguage")} />
        </div>
        <fieldset className="check-group">
          <legend>{t("notifyMe")}</legend>
          {(
            [
              ["notifySms", "notifySms"],
              ["notifyInApp", "notifyInApp"],
              ["notifyPush", "notifyPush"],
            ] as const
          ).map(([name, label]) => (
            <label className="check-row" key={name}>
              <input type="checkbox" {...register(name)} />
              {t(label)}
            </label>
          ))}
          <p className="field-hint">{t("notifyStoredOnly")}</p>
        </fieldset>
      </fieldset>
    </>
  );
}
