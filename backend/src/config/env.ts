import "dotenv/config";
import { z } from "zod";
import { getDatabaseUrl } from "./database-url.js";

const origins = z
  .string()
  .transform((value) => value.split(",").map((origin) => origin.trim()))
  .refine(
    (values) =>
      values.every((value) => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && url.origin === value;
        } catch {
          return false;
        }
      }),
    "Use comma-separated, exact HTTP(S) origins without trailing slashes",
  );
const config = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    CORS_ORIGIN: origins,
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .refine((secret) => !secret.startsWith("REPLACE_")),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(/^[1-9]\d{0,2}[sm]$/)
      .default("15m")
      .transform((value) => Number(value.slice(0, -1)) * (value.endsWith("m") ? 60 : 1))
      .pipe(z.number().max(900)),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(30),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    STORAGE_ROOT: z.string().min(1).default("./storage"),
    UPLOAD_MAX_DOCUMENT_MB: z.coerce.number().min(1).max(8).default(5),
    UPLOAD_MAX_PHOTO_MB: z.coerce.number().min(1).max(8).default(8),
    FIELD_ENCRYPTION_KEY: z
      .string()
      .refine((key) => Buffer.from(key, "base64").length === 32, "Must decode to exactly 32 bytes"),
    AADHAAR_HASH_KEY: z
      .string()
      .min(32)
      .refine((key) => !key.startsWith("REPLACE_")),
    AUTH_MODE: z.literal("password").default("password"),
    SEED_DEMO_USERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((value, ctx) => {
    if (
      (value.NODE_ENV === "production" || value.COOKIE_SAME_SITE === "none") &&
      !value.COOKIE_SECURE
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "Must be true for production or SameSite=None",
      });
    }
    if (value.NODE_ENV === "production" && value.SEED_DEMO_USERS) {
      ctx.addIssue({
        code: "custom",
        path: ["SEED_DEMO_USERS"],
        message: "Demo users are disabled in production",
      });
    }
  });

const parsed = config.safeParse({ ...process.env, DATABASE_URL: getDatabaseUrl() });
if (!parsed.success) {
  throw new Error(
    "Invalid backend environment. " +
      parsed.error.issues
        .map((issue) => issue.path.join(".") + " (" + issue.message + ")")
        .join(", "),
  );
}
export const env = parsed.data;
