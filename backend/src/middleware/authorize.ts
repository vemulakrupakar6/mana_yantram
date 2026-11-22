import type { RoleCode } from "@prisma/client";
import type { RequestHandler } from "express";
import { AppError } from "../common/errors/app-error.js";
import type { UserSummary } from "../modules/auth/auth.types.js";

function check(hasAccess: (user: UserSummary) => boolean): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, "AUTH_REQUIRED", "Sign in to continue."));
    if (!hasAccess(req.auth))
      return next(
        new AppError(403, "ACCESS_DENIED", "You do not have permission to access this page."),
      );
    next();
  };
}
export function authorize(...roles: RoleCode[]) {
  return check((user) => roles.some((role) => user.roles.includes(role)));
}
export function requirePermission(permission: string) {
  return check((user) => user.permissions.includes(permission));
}
