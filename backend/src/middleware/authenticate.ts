import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../common/errors/app-error.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { authenticatedUser } from "../modules/auth/auth.repository.js";

// Allowed while a temporary password is still in force (PRD §1.2).
const allowedWhileMustChange = new Set([
  "GET /api/v1/auth/me",
  "PATCH /api/v1/auth/change-password",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/logout-all",
]);

export const authenticate: RequestHandler = async (req, _res, next) => {
  const match = /^Bearer ([\w.-]+)$/i.exec(req.get("Authorization") ?? "");
  if (!match) throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue.");
  let claims: ReturnType<typeof verifyAccessToken>;
  try {
    claims = verifyAccessToken(match[1]);
  } catch (error) {
    const code = error instanceof jwt.TokenExpiredError ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    throw new AppError(401, code, "Sign in to continue.");
  }
  const user = await authenticatedUser(claims.sub, claims.sid);
  if (!user) throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
  if (user.mustChangePassword) {
    const route = req.method + " " + req.originalUrl.split("?")[0].replace(/\/+$/, "");
    if (!allowedWhileMustChange.has(route))
      throw new AppError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "You must change your temporary password before continuing.",
      );
  }
  req.auth = user;
  next();
};
