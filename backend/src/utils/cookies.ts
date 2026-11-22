import type { Request, Response } from "express";
import { env } from "../config/env.js";

const name = "mana_refresh";
const options = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/api/v1/auth",
} as const;

export function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(name, token, { ...options, expires });
}
export function clearRefreshCookie(res: Response) {
  res.clearCookie(name, options);
}
export function refreshCookie(req: Request): string | undefined {
  const token: unknown = req.cookies?.[name];
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
