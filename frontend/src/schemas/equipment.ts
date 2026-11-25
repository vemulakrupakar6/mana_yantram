import { z } from "zod";

const thisYear = new Date().getFullYear();
export const equipmentDetailsSchema = z
  .object({
    categoryId: z.string().min(1, "required"),
    make: z.string().trim().min(1, "required").max(80, "tooLong"),
    model: z.string().trim().min(1, "required").max(80, "tooLong"),
    year: z
      .string()
      .regex(/^\d{4}$/, "yearInvalid")
      .refine((v) => Number(v) >= 1980 && Number(v) <= thisYear + 1, "yearInvalid"),
    capacityValue: z
      .string()
      .trim()
      .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) > 0), "capacityInvalid"),
    capacityUnit: z.enum(["", "HP", "LITRES", "FEET", "TONNES"]),
    implementsText: z.string().max(700, "tooLong"),
  })
  .superRefine((d, ctx) => {
    if (Boolean(d.capacityValue) !== Boolean(d.capacityUnit))
      ctx.addIssue({ code: "custom", path: ["capacityUnit"], message: "capacityPair" });
    if (parseImplements(d.implementsText).length > 10)
      ctx.addIssue({ code: "custom", path: ["implementsText"], message: "implementsMax" });
  });
export type EquipmentDetailsValues = z.infer<typeof equipmentDetailsSchema>;

export const equipmentWizardSchema = z.intersection(
  equipmentDetailsSchema,
  z.object({
    numberOfUnits: z
      .string()
      .regex(/^\d+$/, "unitsInvalid")
      .refine((v) => Number(v) >= 1 && Number(v) <= 50, "unitsInvalid"),
  }),
);
export type EquipmentWizardValues = z.infer<typeof equipmentWizardSchema>;

export const parseImplements = (text: string) =>
  text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const paise = (min: number, message: string) =>
  z
    .number()
    .nullable()
    .refine((v) => v !== null && Number.isInteger(v) && v >= min, message);
export const serviceFormSchema = z
  .object({
    operationId: z.string().min(1, "required"),
    pricingBasis: z.enum(["ACRE", "HOUR", "DAY"]),
    ratePaise: paise(100, "rateMin"),
    minChargePaise: z
      .number()
      .nullable()
      .refine((v) => v === null || v >= 0, "required"),
    travelMode: z.enum(["NONE", "FLAT", "PER_KM"]),
    travelFlatPaise: z.number().nullable(),
    travelPerKmPaise: z.number().nullable(),
    freeRadiusKm: z
      .string()
      .trim()
      .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), "required"),
    workRateAcresPerHour: z
      .string()
      .trim()
      .refine(
        (v) => Number.isFinite(Number(v)) && Number(v) >= 0.1 && Number(v) <= 50,
        "workRateInvalid",
      ),
  })
  .superRefine((d, ctx) => {
    if (d.travelMode === "FLAT" && d.travelFlatPaise === null)
      ctx.addIssue({ code: "custom", path: ["travelFlatPaise"], message: "required" });
    if (d.travelMode === "PER_KM" && (d.travelPerKmPaise === null || d.travelPerKmPaise < 1))
      ctx.addIssue({ code: "custom", path: ["travelPerKmPaise"], message: "required" });
  });
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;
