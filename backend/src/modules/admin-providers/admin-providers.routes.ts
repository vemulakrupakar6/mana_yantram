import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import { permissions } from "../rbac/roles.js";
import * as service from "./admin-providers.service.js";
import {
  listQuerySchema,
  reinstateSchema,
  reviewSchema,
  suspendSchema,
  verifySchema,
} from "./admin-providers.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const uuid = (req: Request, name: string) => {
  const parsed = z.uuid().safeParse(req.params[name]);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};
function query<T>(schema: ZodType<T>, req: Request): T {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success)
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Validation failed.",
      parsed.error.issues.map((i) => ({ field: i.path.join(".") || "query", message: i.message })),
    );
  return parsed.data;
}

export const adminProvidersRoutes = Router();
adminProvidersRoutes.use(authenticate);
const view = requirePermission(permissions.providerView);
const verifyPermission = requirePermission(permissions.providerVerify);
const suspendPermission = requirePermission(permissions.providerSuspend);
const write = protectCookieOperation;

adminProvidersRoutes.get("/", view, async (req, res) => {
  success(res, "Providers.", await service.listProviders(req.auth!, query(listQuerySchema, req)));
});
adminProvidersRoutes.get("/:id", view, async (req, res) => {
  success(res, "Provider.", await service.getProvider(req.auth!, uuid(req, "id")));
});
adminProvidersRoutes.post(
  "/:id/documents/:docId/review",
  write,
  verifyPermission,
  validate(reviewSchema),
  async (req, res) => {
    success(
      res,
      "Document reviewed.",
      await service.reviewDocument(
        req.auth!,
        uuid(req, "id"),
        uuid(req, "docId"),
        req.body,
        details(req),
      ),
    );
  },
);
adminProvidersRoutes.post(
  "/:id/bank-account/review",
  write,
  verifyPermission,
  validate(reviewSchema),
  async (req, res) => {
    success(
      res,
      "Bank account reviewed.",
      await service.reviewBank(req.auth!, uuid(req, "id"), req.body, details(req)),
    );
  },
);
adminProvidersRoutes.get("/:id/bank-account/reveal", verifyPermission, async (req, res) => {
  success(res, "Bank account.", await service.revealBank(req.auth!, uuid(req, "id"), details(req)));
});
adminProvidersRoutes.post(
  "/:id/verify",
  write,
  verifyPermission,
  validate(verifySchema),
  async (req, res) => {
    success(
      res,
      "Application updated.",
      await service.verify(req.auth!, uuid(req, "id"), req.body, details(req)),
    );
  },
);
adminProvidersRoutes.post(
  "/:id/suspend",
  write,
  suspendPermission,
  validate(suspendSchema),
  async (req, res) => {
    success(
      res,
      "Provider suspended.",
      await service.suspend(req.auth!, uuid(req, "id"), req.body.remarks, details(req)),
    );
  },
);
adminProvidersRoutes.post(
  "/:id/blacklist",
  write,
  suspendPermission,
  validate(suspendSchema),
  async (req, res) => {
    success(
      res,
      "Provider blacklisted.",
      await service.blacklist(req.auth!, uuid(req, "id"), req.body.remarks, details(req)),
    );
  },
);
adminProvidersRoutes.post(
  "/:id/reinstate",
  write,
  suspendPermission,
  validate(reinstateSchema),
  async (req, res) => {
    success(
      res,
      "Provider reinstated.",
      await service.reinstate(req.auth!, uuid(req, "id"), req.body.remarks, details(req)),
    );
  },
);
