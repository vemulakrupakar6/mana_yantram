import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../common/errors/app-error.js";

export const protectCookieOperation: RequestHandler = (req, _res, next) => {
  const origin = req.get("Origin");
  const localDocs =
    env.NODE_ENV === "development" &&
    ["http://localhost:" + env.PORT, "http://127.0.0.1:" + env.PORT].includes(origin ?? "");
  if (
    (origin && !localDocs && !env.CORS_ORIGIN.includes(origin)) ||
    req.get("X-CSRF-Protection") !== "1"
  ) {
    return next(new AppError(403, "ORIGIN_DENIED", "This request is not allowed."));
  }
  next();
};
