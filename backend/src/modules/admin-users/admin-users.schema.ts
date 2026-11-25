import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { departmentRoles } from "../rbac/roles.js";
import { username } from "../auth/auth.schema.js";

const temporaryPassword = z.string().min(12, "Use at least 12 characters.").max(128);
const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.");
const uuid = z.uuid();
const departmentRoleEnum = z.enum(departmentRoles as unknown as [string, ...string[]]);

export const createUserSchema = z.strictObject({
  username,
  displayName: z.string().trim().min(2).max(150),
  mobile: mobile.optional(),
  role: departmentRoleEnum,
  jurisdiction: z.strictObject({
    level: z.enum(["STATE", "DISTRICT", "MANDAL"]),
    districtId: uuid.optional(),
    mandalId: uuid.optional(),
  }),
  temporaryPassword,
});
export const deactivateSchema = z.strictObject({ reason: z.string().trim().min(5).max(300) });
export const resetPasswordSchema = z.strictObject({ temporaryPassword });
export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(RoleCode).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  districtId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
