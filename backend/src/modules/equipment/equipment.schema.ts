import { z } from "zod";

const uuid = z.uuid();
const thisYear = new Date().getFullYear();
const capacityUnit = z.enum(["HP", "LITRES", "FEET", "TONNES"]);

const equipmentFields = {
  categoryId: uuid,
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: z
    .number()
    .int()
    .min(1980)
    .max(thisYear + 1),
  capacityValue: z.number().positive().max(99_999_999),
  capacityUnit,
  implements: z.array(z.string().trim().min(1).max(60)).max(10),
};
const bothOrNeither = (input: { capacityValue?: unknown; capacityUnit?: unknown }) =>
  (input.capacityValue == null) === (input.capacityUnit == null);
const capacityRule = {
  path: ["capacityUnit"],
  message: "Provide both the capacity and its unit, or neither.",
};
const photoIds = z
  .array(uuid)
  .min(1, "Add 1 to 5 photos.")
  .max(5, "Add 1 to 5 photos.")
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate photos.");

export const createEquipmentSchema = z
  .strictObject({
    ...equipmentFields,
    capacityValue: equipmentFields.capacityValue.optional(),
    capacityUnit: capacityUnit.optional(),
    implements: equipmentFields.implements.optional(),
    numberOfUnits: z.number().int().min(1).max(50),
    photoFileIds: photoIds,
  })
  .refine(bothOrNeither, capacityRule);
export const updateEquipmentSchema = z
  .strictObject({
    ...equipmentFields,
    capacityValue: equipmentFields.capacityValue.nullable(),
    capacityUnit: capacityUnit.nullable(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." });
export const photosSchema = z.strictObject({ fileIds: photoIds });
export const addUnitsSchema = z.strictObject({ count: z.number().int().min(1).max(20) });
export const updateUnitSchema = z
  .strictObject({
    registrationNo: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/, "Use a registration like TS09AB1234."),
      )
      .nullable(),
    droneUin: z.string().trim().min(1).max(30).nullable(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." });

const money = (min: number) => z.number().int().min(min).max(1_000_000_00);
const serviceShape = {
  operationId: uuid,
  pricingBasis: z.enum(["ACRE", "HOUR", "DAY"]),
  ratePaise: money(100),
  minChargePaise: money(0).default(0),
  travelMode: z.enum(["NONE", "FLAT", "PER_KM"]).default("NONE"),
  travelFlatPaise: money(0).optional(),
  travelPerKmPaise: money(1).optional(),
  freeRadiusKm: z.number().min(0).max(500).optional(),
  workRateAcresPerHour: z.number().min(0.1).max(50),
};
type TravelInput = {
  travelMode?: "NONE" | "FLAT" | "PER_KM";
  travelFlatPaise?: number;
  travelPerKmPaise?: number;
  freeRadiusKm?: number;
};
/** Mirrors the chk_service_money CHECK so bad combinations fail as field errors, not 500s. */
export function validateTravel(input: TravelInput, ctx: z.RefinementCtx) {
  const mode = input.travelMode ?? "NONE";
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (mode === "NONE") {
    if (input.travelFlatPaise !== undefined)
      issue("travelFlatPaise", "Not used without travel charges.");
    if (input.travelPerKmPaise !== undefined)
      issue("travelPerKmPaise", "Not used without travel charges.");
    if (input.freeRadiusKm !== undefined) issue("freeRadiusKm", "Not used without travel charges.");
  } else if (mode === "FLAT") {
    if (input.travelFlatPaise === undefined)
      issue("travelFlatPaise", "Enter the flat travel charge.");
    if (input.travelPerKmPaise !== undefined)
      issue("travelPerKmPaise", "Not used with a flat charge.");
  } else {
    if (input.travelPerKmPaise === undefined) issue("travelPerKmPaise", "Enter the per-km charge.");
    if (input.travelFlatPaise !== undefined)
      issue("travelFlatPaise", "Not used with a per-km charge.");
  }
}
export const serviceSchema = z.strictObject(serviceShape).superRefine(validateTravel);
// Not derived from serviceShape: .partial() would still apply the shape's .default() values and
// silently reset minChargePaise / travelMode on every PATCH.
export const servicePatchSchema = z
  .strictObject({
    pricingBasis: z.enum(["ACRE", "HOUR", "DAY"]),
    ratePaise: money(100),
    minChargePaise: money(0),
    travelMode: z.enum(["NONE", "FLAT", "PER_KM"]),
    travelFlatPaise: money(0).nullable(),
    travelPerKmPaise: money(1).nullable(),
    freeRadiusKm: z.number().min(0).max(500).nullable(),
    workRateAcresPerHour: z.number().min(0.1).max(50),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." });

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type ServicePatch = z.infer<typeof servicePatchSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
