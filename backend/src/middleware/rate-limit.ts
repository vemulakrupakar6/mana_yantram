import type { RequestHandler } from "express";
import { AppError } from "../common/errors/app-error.js";
import { database } from "../config/database.js";
import { digest } from "../utils/crypto.js";

const windowMs = 15 * 60_000;
export function rateLimit(operation: string, byIp: number, byUsername?: number): RequestHandler {
  return async (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const limits: [string, number][] = [[digest(operation + ":ip:" + ip), byIp]];
    if (byUsername)
      limits.push([digest(operation + ":account:" + ip + ":" + req.body.username), byUsername]);
    for (const [key, maxAttempts] of limits) {
      const [{ attempts, expiresAt }] = await database.$queryRaw<
        { attempts: number; expiresAt: Date }[]
      >`
        INSERT INTO auth_rate_limits AS rate (key, attempts, expires_at)
        VALUES (${key}, 1, clock_timestamp() + (${windowMs} * interval '1 millisecond'))
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE WHEN rate.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(rate.attempts + 1, ${maxAttempts + 1}) END,
          expires_at = CASE WHEN rate.expires_at <= clock_timestamp() THEN EXCLUDED.expires_at ELSE rate.expires_at END
        RETURNING attempts, expires_at AS "expiresAt"
      `;
      if (attempts > maxAttempts) {
        res.setHeader(
          "Retry-After",
          Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
        );
        throw new AppError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
      }
    }
    next();
  };
}
export async function cleanExpiredRateLimits() {
  await database.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
