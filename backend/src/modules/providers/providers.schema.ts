import { z } from "zod";

const uuid = z.uuid();
const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.");
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
        "Enter a valid 15-character GSTIN.",
      ),
  );
const fields = {
  type: z.enum(["INDIVIDUAL", "FPO", "CHC", "AGENCY"]),
  name: z.string().trim().min(2).max(200),
  contactPerson: z.string().trim().min(2).max(150),
  mobile,
  email: z.string().trim().max(254).pipe(z.email()),
  addressLine: z.string().trim().min(5).max(300),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode."),
  districtId: uuid,
  mandalId: uuid,
  villageId: uuid,
  baseLatitude: z.number().min(6).max(38),
  baseLongitude: z.number().min(68).max(98),
  registrationNo: z.string().trim().min(3).max(60),
  gstin,
};
const registrationRule = {
  path: ["registrationNo"],
  message: "A registration number is required for this provider type.",
};
export const providerProfileSchema = z
  .strictObject({
    ...fields,
    email: fields.email.optional(),
    pincode: fields.pincode.optional(),
    registrationNo: fields.registrationNo.optional(),
    gstin: fields.gstin.optional(),
  })
  .refine(
    (input) => input.type === "INDIVIDUAL" || Boolean(input.registrationNo),
    registrationRule,
  );
export const providerProfilePatchSchema = z
  .strictObject({
    ...fields,
    // Optional fields can be cleared with null.
    email: fields.email.nullable(),
    pincode: fields.pincode.nullable(),
    registrationNo: fields.registrationNo.nullable(),
    gstin: fields.gstin.nullable(),
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

export const documentUploadSchema = z.strictObject({
  documentTypeCode: z.string().trim().min(1).max(40),
  equipmentId: uuid.optional(),
  fileId: uuid,
});
export const bankAccountSchema = z
  .strictObject({
    holderName: z.string().trim().min(2).max(150),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, "Use 9 to 18 digits."),
    confirmAccountNumber: z.string().trim(),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC.")),
  })
  .refine((input) => input.accountNumber === input.confirmAccountNumber, {
    path: ["confirmAccountNumber"],
    message: "Account numbers must match.",
  });
export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;
export type ProviderProfilePatch = z.infer<typeof providerProfilePatchSchema>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

const hhmm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:MM.");
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export const coverageSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("RADIUS"), radiusKm: z.number().int().min(1).max(100) }),
  z.strictObject({
    mode: z.literal("AREAS"),
    areas: z
      .array(z.union([z.strictObject({ mandalId: uuid }), z.strictObject({ villageId: uuid })]))
      .min(1)
      .max(200),
  }),
]);
export const workingHoursSchema = z
  .strictObject({
    days: z
      .array(
        z
          .strictObject({ weekday: z.number().int().min(1).max(7), start: hhmm, end: hhmm })
          .refine((d) => minutes(d.start) < minutes(d.end), {
            path: ["end"],
            message: "The end time must be after the start time.",
          }),
      )
      .min(1)
      .max(7),
  })
  .refine((input) => new Set(input.days.map((d) => d.weekday)).size === input.days.length, {
    path: ["days"],
    message: "Each weekday can appear only once.",
  });
export const toMinutes = minutes;
export type CoverageInput = z.infer<typeof coverageSchema>;
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;
