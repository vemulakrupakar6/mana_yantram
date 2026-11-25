import { z } from "zod";
import { isValidAadhaar } from "../../utils/aadhaar.js";
import { language, username } from "../auth/auth.schema.js";

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.");
const uuid = z.uuid();
const aadhaar = z.string().trim().refine(isValidAadhaar, "Enter a valid 12-digit Aadhaar number.");

export const farmerProfileSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(150),
  relationType: z.enum(["FATHER", "HUSBAND"]),
  relativeName: z.string().trim().min(2).max(150),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  mobile,
  districtId: uuid,
  mandalId: uuid,
  villageId: uuid,
  aadhaarNumber: aadhaar.optional(),
  preferredLanguage: language,
  notifications: z.strictObject({ sms: z.boolean(), inApp: z.boolean(), push: z.boolean() }),
});
export const farmerProfilePatchSchema = z
  .strictObject({
    fullName: farmerProfileSchema.shape.fullName,
    relationType: farmerProfileSchema.shape.relationType,
    relativeName: farmerProfileSchema.shape.relativeName,
    gender: farmerProfileSchema.shape.gender,
    mobile,
    districtId: uuid,
    mandalId: uuid,
    villageId: uuid,
    aadhaarNumber: aadhaar.nullable(),
    preferredLanguage: language,
    notifications: farmerProfileSchema.shape.notifications.partial(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." })
  .refine(
    (input) => {
      const given = [input.districtId, input.mandalId, input.villageId].filter(Boolean).length;
      return given === 0 || given === 3;
    },
    { path: ["villageId"], message: "Change district, mandal and village together." },
  );

const crop = z.strictObject({
  cropId: uuid,
  season: z.enum(["KHARIF", "RABI", "SUMMER"]),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1),
});
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const polygonSchema = z
  .strictObject({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(point).min(4).max(200)).length(1),
  })
  .refine(
    ({ coordinates: [ring] }) =>
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1],
    { message: "The polygon must be closed (first point equals last)." },
  );
const plotFields = {
  surveyNo: z.string().trim().min(1).max(50),
  extentAcres: z
    .number()
    .min(0.01)
    .max(1000)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      "Use at most 2 decimals.",
    ),
  villageId: uuid,
  latitude: z.number().min(6).max(38),
  longitude: z.number().min(68).max(98),
  boundary: polygonSchema.optional(),
  crops: z.array(crop).max(10),
};
const uniqueCrops = (input: { crops?: z.infer<typeof crop>[] }) =>
  new Set(input.crops?.map((c) => [c.cropId, c.season, c.year].join("|"))).size ===
  (input.crops?.length ?? 0);
export const plotSchema = z
  .strictObject(plotFields)
  .refine(uniqueCrops, { path: ["crops"], message: "Duplicate crop entries." });
export const plotPatchSchema = z
  .strictObject(plotFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." })
  .refine(uniqueCrops, { path: ["crops"], message: "Duplicate crop entries." });

export const assistedRegistrationSchema = z.strictObject({
  account: z.strictObject({
    username,
    temporaryPassword: z.string().min(12, "Use at least 12 characters.").max(128),
  }),
  profile: farmerProfileSchema,
  plots: z.array(plotSchema).max(5).optional(),
  consent: z.strictObject({
    farmerConsented: z.literal(true),
    acceptTerms: z.literal(true),
    acceptPrivacyPolicy: z.literal(true),
  }),
});

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const assistedListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  ...pageQuery,
});
export const adminFarmersQuery = z.object({
  districtId: uuid.optional(),
  mandalId: uuid.optional(),
  villageId: uuid.optional(),
  search: z.string().trim().max(100).optional(),
  assisted: z.enum(["true", "false"]).optional(),
  ...pageQuery,
});
export type FarmerProfileInput = z.infer<typeof farmerProfileSchema>;
export type FarmerProfilePatch = z.infer<typeof farmerProfilePatchSchema>;
export type PlotInput = z.infer<typeof plotSchema>;
export type PlotPatch = z.infer<typeof plotPatchSchema>;
export type AssistedInput = z.infer<typeof assistedRegistrationSchema>;
