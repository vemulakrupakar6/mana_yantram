import { z } from "zod";
import { publicRoles } from "../rbac/roles.js";

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9._-]{3,50}$/, "Use 3–50 letters, numbers, periods, underscores or hyphens."),
  );
const password = z.string().min(12, "Use at least 12 characters.").max(128);
const providedPassword = z.string().min(1).max(128);
export const language = z.enum(["en", "te"]);
export const registerSchema = z
  .strictObject({
    username,
    password,
    confirmPassword: providedPassword,
    role: z.enum(publicRoles),
    preferredLanguage: language,
    acceptTerms: z.literal(true),
    acceptPrivacyPolicy: z.literal(true),
  })
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
export const loginSchema = z.strictObject({ username, password: providedPassword });
export const passwordSchema = z
  .strictObject({
    currentPassword: providedPassword,
    newPassword: password,
    confirmPassword: providedPassword,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    path: ["newPassword"],
    message: "Choose a different password.",
  });
export const addRoleSchema = z.strictObject({ role: z.enum(publicRoles) });
export type AddRoleInput = z.infer<typeof addRoleSchema>;
export type RegistrationInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordInput = z.infer<typeof passwordSchema>;
