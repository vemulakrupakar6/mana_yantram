import { z } from "zod";
import { username } from "../auth/auth.schema.js";

const uuid = z.uuid();
const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.");
const temporaryPassword = z.string().min(12, "Use at least 12 characters.").max(128);
const fields = {
  fullName: z.string().trim().min(2).max(150),
  mobile,
  licenceNo: z.string().trim().min(3).max(40),
  licenceFileId: uuid,
};
export const createOperatorSchema = z.strictObject({
  fullName: fields.fullName,
  mobile,
  licenceNo: fields.licenceNo.optional(),
  licenceFileId: uuid.optional(),
  username,
  temporaryPassword,
  equipmentIds: z.array(uuid).max(100).optional(),
});
export const updateOperatorSchema = z
  .strictObject({
    fullName: fields.fullName,
    mobile,
    licenceNo: fields.licenceNo.nullable(),
    licenceFileId: uuid.nullable(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." });
export const operatorEquipmentSchema = z.strictObject({ equipmentIds: z.array(uuid).max(100) });
export const resetOperatorPasswordSchema = z.strictObject({ temporaryPassword });
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>;
export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;
