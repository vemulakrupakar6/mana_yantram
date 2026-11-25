import { Router, type Request } from "express";
import { z } from "zod";
import { success } from "../../common/responses/success.js";
import { AppError } from "../../common/errors/app-error.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import { permissions } from "../rbac/roles.js";
import * as service from "./admin-users.service.js";
import {
  createUserSchema,
  deactivateSchema,
  listQuerySchema,
  resetPasswordSchema,
} from "./admin-users.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const idOf = (req: Request) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};

export const adminUsersRoutes = Router();
adminUsersRoutes.use(authenticate, requirePermission(permissions.usersManage));
adminUsersRoutes.get("/", async (req, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success)
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Validation failed.",
      query.error.issues.map((i) => ({ field: i.path.join(".") || "query", message: i.message })),
    );
  success(res, "Users.", await service.listUsers(req.auth!, query.data));
});
adminUsersRoutes.get("/:id", async (req, res) => {
  success(res, "User.", await service.getUser(req.auth!, idOf(req)));
});
adminUsersRoutes.post("/", protectCookieOperation, validate(createUserSchema), async (req, res) => {
  success(res, "User created.", await service.createUser(req.auth!, req.body, details(req)), 201);
});
adminUsersRoutes.post(
  "/:id/deactivate",
  protectCookieOperation,
  validate(deactivateSchema),
  async (req, res) => {
    success(
      res,
      "User deactivated.",
      await service.deactivateUser(req.auth!, idOf(req), req.body.reason, details(req)),
    );
  },
);
adminUsersRoutes.post("/:id/reactivate", protectCookieOperation, async (req, res) => {
  success(
    res,
    "User reactivated.",
    await service.reactivateUser(req.auth!, idOf(req), details(req)),
  );
});
adminUsersRoutes.post(
  "/:id/reset-password",
  protectCookieOperation,
  validate(resetPasswordSchema),
  async (req, res) => {
    success(
      res,
      "Password reset. The user must change it at next sign-in.",
      await service.resetPassword(req.auth!, idOf(req), req.body.temporaryPassword, details(req)),
    );
  },
);
