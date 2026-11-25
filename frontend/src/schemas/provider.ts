import { z } from "zod";

const number = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)), "required")
    .refine((v) => Number(v) >= min && Number(v) <= max, message);

export const providerFormSchema = z
  .object({
    type: z.enum(["INDIVIDUAL", "FPO", "CHC", "AGENCY"]),
    name: z.string().trim().min(2, "required").max(200, "tooLong"),
    contactPerson: z.string().trim().min(2, "required").max(150, "tooLong"),
    mobile: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "mobileInvalid"),
    email: z
      .string()
      .trim()
      .refine((v) => !v || z.email().safeParse(v).success, "emailInvalid"),
    addressLine: z.string().trim().min(5, "required").max(300, "tooLong"),
    pincode: z
      .string()
      .trim()
      .refine((v) => !v || /^[1-9]\d{5}$/.test(v), "pincodeInvalid"),
    districtId: z.string().min(1, "required"),
    mandalId: z.string().min(1, "required"),
    villageId: z.string().min(1, "required"),
    baseLatitude: number(6, 38, "latitudeInvalid"),
    baseLongitude: number(68, 98, "longitudeInvalid"),
    registrationNo: z.string().trim().max(60, "tooLong"),
    gstin: z
      .string()
      .trim()
      .refine(
        (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.toUpperCase()),
        "gstinInvalid",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "INDIVIDUAL" && data.registrationNo.trim().length < 3)
      ctx.addIssue({ code: "custom", path: ["registrationNo"], message: "registrationRequired" });
  });
export type ProviderFormValues = z.infer<typeof providerFormSchema>;

export const bankFormSchema = z
  .object({
    holderName: z.string().trim().min(2, "required").max(150, "tooLong"),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, "accountInvalid"),
    confirmAccountNumber: z.string().trim(),
    ifsc: z
      .string()
      .trim()
      .refine((v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase()), "ifscInvalid"),
  })
  .refine((d) => d.accountNumber === d.confirmAccountNumber, {
    path: ["confirmAccountNumber"],
    message: "accountMismatch",
  });
export type BankFormValues = z.infer<typeof bankFormSchema>;
