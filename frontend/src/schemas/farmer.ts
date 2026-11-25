import { z } from "zod";
import { isValidAadhaar } from "@/utils/aadhaar";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9._-]{3,50}$/, "usernameInvalid"));
const decimal = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), "required")
    .refine((value) => Number(value) >= min && Number(value) <= max, message);

export const farmerFormSchema = z.object({
  fullName: z.string().trim().min(2, "required").max(150, "tooLong"),
  relationType: z.enum(["FATHER", "HUSBAND"]),
  relativeName: z.string().trim().min(2, "required").max(150, "tooLong"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "mobileInvalid"),
  districtId: z.string().min(1, "required"),
  mandalId: z.string().min(1, "required"),
  villageId: z.string().min(1, "required"),
  aadhaarNumber: z
    .string()
    .trim()
    .refine((value) => !value || isValidAadhaar(value), "aadhaarInvalid"),
  removeAadhaar: z.boolean(),
  preferredLanguage: z.enum(["en", "te"]),
  notifySms: z.boolean(),
  notifyInApp: z.boolean(),
  notifyPush: z.boolean(),
});
export type FarmerFormValues = z.infer<typeof farmerFormSchema>;

export const assistedFormSchema = farmerFormSchema.extend({
  username,
  temporaryPassword: z.string().min(12, "passwordInvalid").max(128, "passwordInvalid"),
  consent: z.boolean().refine(Boolean, "consentRequired"),
});
export type AssistedFormValues = z.infer<typeof assistedFormSchema>;

const currentYear = new Date().getFullYear();
export const plotFormSchema = z.object({
  surveyNo: z.string().trim().min(1, "required").max(50, "tooLong"),
  extentAcres: decimal(0.01, 1000, "extentInvalid").refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value.trim()),
    "extentInvalid",
  ),
  districtId: z.string().min(1, "required"),
  mandalId: z.string().min(1, "required"),
  villageId: z.string().min(1, "required"),
  latitude: decimal(6, 38, "latitudeInvalid"),
  longitude: decimal(68, 98, "longitudeInvalid"),
  crops: z
    .array(
      z.object({
        cropId: z.string().min(1, "required"),
        season: z.enum(["KHARIF", "RABI", "SUMMER"]),
        year: z
          .string()
          .regex(/^\d{4}$/, "yearInvalid")
          .refine((v) => Number(v) >= 2000 && Number(v) <= currentYear + 1, "yearInvalid"),
      }),
    )
    .max(10),
});
export type PlotFormValues = z.infer<typeof plotFormSchema>;
