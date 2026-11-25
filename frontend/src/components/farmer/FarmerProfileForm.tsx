import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { farmersApi } from "@/api/farmers.api";
import { LoadingSpinner } from "@/components/common/shared";
import { Button } from "@/components/ui/button";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { farmerFormSchema, type FarmerFormValues } from "@/schemas/farmer";
import type { Farmer } from "@/types/farmer";
import {
  emptyFarmerValues,
  FarmerFields,
  toProfilePayload,
  valuesFromFarmer,
} from "./FarmerFields";

const fieldKeys = ["aadhaarNumber", "mobile"] as const;

/** Create (onboarding) when `farmer` is absent, edit otherwise. */
export function FarmerProfileForm({
  farmer,
  language,
  onSaved,
  extraActions,
}: {
  farmer?: Farmer;
  language?: "en" | "te";
  onSaved: (farmer: Farmer) => void | Promise<void>;
  extraActions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const form = useForm<FarmerFormValues>({
    resolver: zodResolver(farmerFormSchema),
    defaultValues: farmer
      ? valuesFromFarmer(farmer)
      : { ...emptyFarmerValues, preferredLanguage: language ?? "en" },
  });
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const submit = handleSubmit(async (values) => {
    try {
      const payload = toProfilePayload(values);
      const saved = farmer ? await farmersApi.update(payload) : await farmersApi.create(payload);
      await onSaved(saved);
    } catch (error) {
      const key = errorKey(error);
      if (key === "aadhaarTaken") setError("aadhaarNumber", { message: key });
      else if (key === "mobileTaken") setError("mobile", { message: key });
      else if (
        !applyServerErrors(error, setError, [...fieldKeys, "districtId", "mandalId", "villageId"])
      )
        setError("root", { message: key });
    }
  });
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <FarmerFields form={form} existingAadhaar={farmer?.aadhaar.masked} />
      {errors.root?.message && (
        <p role="alert" className="form-alert">
          {t(errors.root.message)}
        </p>
      )}
      <div className="form-actions">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <LoadingSpinner />}
          {t(farmer ? "save" : "continue")}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
