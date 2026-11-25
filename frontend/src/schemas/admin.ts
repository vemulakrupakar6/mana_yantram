import { z } from "zod";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9._-]{3,50}$/, "usernameInvalid"));
export const temporaryPassword = z.string().min(12, "passwordInvalid").max(128, "passwordInvalid");
export const mobileField = z
  .string()
  .trim()
  .refine((value) => !value || /^[6-9]\d{9}$/.test(value), "mobileInvalid");

export const createUserSchema = z
  .object({
    username,
    displayName: z.string().trim().min(2, "required").max(150, "displayNameInvalid"),
    mobile: mobileField,
    role: z.string().min(1, "required"),
    level: z.enum(["STATE", "DISTRICT", "MANDAL"]),
    districtId: z.string(),
    mandalId: z.string(),
    temporaryPassword,
  })
  .superRefine((data, ctx) => {
    if (data.level !== "STATE" && !data.districtId)
      ctx.addIssue({ code: "custom", path: ["districtId"], message: "required" });
    if (data.level === "MANDAL" && !data.mandalId)
      ctx.addIssue({ code: "custom", path: ["mandalId"], message: "required" });
  });
export const reasonSchema = z.object({ reason: z.string().trim().min(5, "reasonShort").max(300) });
export const resetSchema = z.object({ temporaryPassword });
export type CreateUserForm = z.infer<typeof createUserSchema>;
