import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { providersApi } from "@/api/providers.api";
import { LoadingSpinner } from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { FormField, SelectField } from "@/components/forms/fields";
import { GeoSelect } from "@/components/forms/GeoSelect";
import { LocationField } from "@/components/forms/LocationField";
import { Button } from "@/components/ui/button";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { providerFormSchema, type ProviderFormValues } from "@/schemas/provider";
import {
  providerTypes,
  type FieldRemarks,
  type Provider,
  type ProviderProfilePayload,
  type ProviderType,
} from "@/types/provider";
import { RemarkNotice } from "./ProviderParts";

const empty: ProviderFormValues = {
  type: "INDIVIDUAL",
  name: "",
  contactPerson: "",
  mobile: "",
  email: "",
  addressLine: "",
  pincode: "",
  districtId: "",
  mandalId: "",
  villageId: "",
  baseLatitude: "",
  baseLongitude: "",
  registrationNo: "",
  gstin: "",
};
const fromProvider = (p: Provider): ProviderFormValues => ({
  type: p.type,
  name: p.name,
  contactPerson: p.contactPerson,
  mobile: p.mobile,
  email: p.email ?? "",
  addressLine: p.addressLine,
  pincode: p.pincode ?? "",
  districtId: p.district.id,
  mandalId: p.mandal.id,
  villageId: p.village.id,
  baseLatitude: p.baseLatitude,
  baseLongitude: p.baseLongitude,
  registrationNo: p.registrationNo ?? "",
  gstin: p.gstin ?? "",
});
/** Edits send null for a cleared optional field so it can be removed; creation omits it. */
export function toPayload(v: ProviderFormValues, editing: boolean): ProviderProfilePayload {
  const optional = (value: string, transform = (s: string) => s) =>
    value.trim() ? transform(value.trim()) : editing ? null : undefined;
  const individual = v.type === "INDIVIDUAL";
  return {
    type: v.type,
    name: v.name.trim(),
    contactPerson: v.contactPerson.trim(),
    mobile: v.mobile.trim(),
    email: optional(v.email),
    addressLine: v.addressLine.trim(),
    pincode: optional(v.pincode),
    districtId: v.districtId,
    mandalId: v.mandalId,
    villageId: v.villageId,
    baseLatitude: Number(v.baseLatitude),
    baseLongitude: Number(v.baseLongitude),
    registrationNo:
      individual && !v.registrationNo.trim()
        ? editing
          ? null
          : undefined
        : v.registrationNo.trim(),
    gstin: optional(v.gstin, (s) => s.toUpperCase()),
  };
}

/**
 * Provider unit profile. Without `provider` it is the two-step onboarding form (type cards, then
 * details); with one it edits in place, read-only when the application is locked.
 */
export function ProviderProfileForm({
  provider,
  remarks,
  onSaved,
}: {
  provider?: Provider;
  remarks?: FieldRemarks | null;
  onSaved: (provider: Provider) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const editing = Boolean(provider);
  const locked = provider ? !provider.editable.profile : false;
  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: provider ? fromProvider(provider) : empty,
  });
  const {
    register,
    control,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const [type, districtId, mandalId, villageId, baseLatitude, baseLongitude] = useWatch({
    control,
    name: ["type", "districtId", "mandalId", "villageId", "baseLatitude", "baseLongitude"],
  });
  const needsRegistration = type !== "INDIVIDUAL";
  const submit = handleSubmit(async (values) => {
    try {
      const payload = toPayload(values, editing);
      const saved = editing
        ? await providersApi.update(payload)
        : await providersApi.create(payload);
      await onSaved(saved);
    } catch (error) {
      const key = errorKey(error);
      if (!applyServerErrors(error, setError)) setError("root", { message: key });
    }
  });
  const note = (key: keyof FieldRemarks) => (
    <RemarkNotice text={remarks?.[key] as string | undefined} />
  );

  if (step === 1)
    return (
      <div className="form-stack">
        <fieldset className="role-options" aria-label={t("providerType")}>
          <legend>{t("providerType")}</legend>
          {providerTypes.map((value: ProviderType) => (
            <label className="role-card" key={value}>
              <input
                type="radio"
                name="provider-type"
                checked={type === value}
                onChange={() => setValue("type", value)}
              />
              <span>
                <strong>{t("type_" + value)}</strong>
                <small className="muted">{t("typeHint_" + value)}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <Button onClick={() => setStep(2)}>{t("continue")}</Button>
        </div>
      </div>
    );
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <fieldset className="form-stack" disabled={locked}>
        {editing ? (
          <div>
            <FormField id="prov-type" label={t("providerType")}>
              <SelectField id="prov-type" {...register("type")}>
                {providerTypes.map((value) => (
                  <option key={value} value={value}>
                    {t("type_" + value)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            {note("type")}
          </div>
        ) : (
          <p className="muted">
            {t("providerType")}: <strong>{t("type_" + type)}</strong>{" "}
            <Button type="button" variant="ghost" size="small" onClick={() => setStep(1)}>
              {t("change")}
            </Button>
          </p>
        )}
        <div className="form-grid">
          <div>
            <TextField
              label="unitName"
              input={{ id: "prov-name", ...register("name") }}
              error={errors.name?.message}
            />
            {note("name")}
          </div>
          <div>
            <TextField
              label="contactPerson"
              input={{ id: "prov-contact", ...register("contactPerson") }}
              error={errors.contactPerson?.message}
            />
            {note("contactPerson")}
          </div>
          <div>
            <TextField
              label="mobile"
              hint="mobileHint10"
              input={{
                id: "prov-mobile",
                type: "tel",
                inputMode: "numeric",
                ...register("mobile"),
              }}
              error={errors.mobile?.message}
            />
            {note("mobile")}
          </div>
          <div>
            <TextField
              label="emailOptional"
              input={{ id: "prov-email", type: "email", ...register("email") }}
              error={errors.email?.message}
            />
            {note("email")}
          </div>
          <div>
            <TextField
              label="addressLine"
              input={{
                id: "prov-address",
                autoComplete: "street-address",
                ...register("addressLine"),
              }}
              error={errors.addressLine?.message}
            />
            {note("addressLine")}
          </div>
          <div>
            <TextField
              label="pincodeOptional"
              input={{ id: "prov-pincode", inputMode: "numeric", ...register("pincode") }}
              error={errors.pincode?.message}
            />
            {note("pincode")}
          </div>
        </div>
        <div className="form-grid">
          <GeoSelect
            idPrefix="prov-geo"
            value={{ districtId, mandalId, villageId }}
            disabled={locked}
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
        {note("location")}
        <LocationField
          idPrefix="prov-loc"
          disabled={locked}
          value={{ latitude: baseLatitude, longitude: baseLongitude }}
          onChange={(next) => {
            setValue("baseLatitude", next.latitude, { shouldValidate: true });
            setValue("baseLongitude", next.longitude, { shouldValidate: true });
          }}
          errors={{
            latitude: errors.baseLatitude?.message,
            longitude: errors.baseLongitude?.message,
          }}
        />
        {note("baseLocation")}
        <div className="form-grid">
          {needsRegistration && (
            <div>
              <TextField
                label="registrationNo"
                input={{ id: "prov-reg", ...register("registrationNo") }}
                error={errors.registrationNo?.message}
              />
              {note("registrationNo")}
            </div>
          )}
          <div>
            <TextField
              label="gstinOptional"
              hint="gstinHint"
              input={{ id: "prov-gstin", autoCapitalize: "characters", ...register("gstin") }}
              error={errors.gstin?.message}
            />
            {note("gstin")}
          </div>
        </div>
      </fieldset>
      {errors.root?.message && (
        <p role="alert" className="form-alert">
          {t(errors.root.message)}
        </p>
      )}
      {locked ? (
        <p className="muted">{t("profileLocked")}</p>
      ) : (
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t(editing ? "save" : "continue")}
          </Button>
        </div>
      )}
    </form>
  );
}
