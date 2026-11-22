import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../common/errors/app-error.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { authenticatedUser } from "../modules/auth/auth.repository.js";

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
  req.auth = user;
  next();
};
