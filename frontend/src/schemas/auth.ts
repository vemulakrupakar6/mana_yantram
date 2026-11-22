import { z } from "zod";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9._-]{3,50}$/, "usernameInvalid"));
const existingPassword = z.string().min(1, "required").max(128, "passwordInvalid");
const password = z.string().min(12, "passwordInvalid").max(128, "passwordInvalid");
const language = z.enum(["en", "te"]);
export const loginSchema = z.object({ username, password: existingPassword });
export const accountSchema = z
  .object({
    username,
    password,
    confirmPassword: existingPassword,
    role: z.enum(["FARMER", "PROVIDER"]),
    preferredLanguage: language,
    acceptTerms: z.boolean().refine(Boolean, "consentRequired"),
    acceptPrivacyPolicy: z.boolean().refine(Boolean, "consentRequired"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });
export const passwordSchema = z
  .object({
    currentPassword: existingPassword,
    newPassword: password,
    confirmPassword: existingPassword,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "samePassword",
  });
export const profileSchema = z.object({
  displayName: z.string().trim().max(150, "displayNameInvalid"),
  mobile: z
    .string()
    .trim()
    .max(20, "mobileInvalid")
    .refine(
      (value) => !value || (/^\+?[\d ()-]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 7),
      "mobileInvalid",
    ),
  email: z
    .string()
    .trim()
    .max(254, "emailInvalid")
    .refine((value) => !value || z.email().safeParse(value).success, "emailInvalid"),
  preferredLanguage: language,
});
export type LoginInput = z.infer<typeof loginSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type PasswordInput = z.infer<typeof passwordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
