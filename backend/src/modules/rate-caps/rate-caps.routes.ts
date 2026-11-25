import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requirePermission } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import { permissions } from "../rbac/roles.js";
import * as service from "./rate-caps.service.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
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

/** /admin/settings and /admin/rate-caps, for holders of settings.manage. */
export const rateCapAdminRoutes = Router();
// Guards are per route: this router is mounted at /admin beside other routers, so a router-level
// guard would also reject requests meant for them.
const guard = [authenticate, requirePermission(permissions.settingsManage)];
rateCapAdminRoutes.get("/settings/rate-caps-enabled", ...guard, async (_req, res) => {
  success(res, "Rate cap setting.", await service.getEnabled());
});
rateCapAdminRoutes.put(
  "/settings/rate-caps-enabled",
  ...guard,
  protectCookieOperation,
  validate(service.enabledSchema),
  async (req, res) => {
    success(
      res,
      "Rate cap setting updated.",
      await service.setEnabled(req.auth!, req.body.enabled, details(req)),
    );
  },
);
rateCapAdminRoutes.get("/rate-caps", ...guard, async (req, res) => {
  success(res, "Rate caps.", await service.listCaps(query(service.listCapsSchema, req)));
});
rateCapAdminRoutes.post(
  "/rate-caps",
  ...guard,
  protectCookieOperation,
  validate(service.createCapSchema),
  async (req, res) => {
    success(
      res,
      "Rate cap created.",
      await service.createCap(req.auth!, req.body, details(req)),
      201,
    );
  },
);
rateCapAdminRoutes.patch(
  "/rate-caps/:id",
  ...guard,
  protectCookieOperation,
  validate(service.updateCapSchema),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
    success(
      res,
      "Rate cap updated.",
      await service.updateCap(req.auth!, id.data, req.body, details(req)),
    );
  },
);

/** /masters/rate-cap: the cap that applies to the signed-in provider's district, for the rate form. */
export const rateCapHintRoutes = Router();
rateCapHintRoutes.get("/", authenticate, authorize("PROVIDER"), async (req, res) => {
  success(
    res,
    "Rate cap hint.",
    await service.capHint(req.auth!, query(service.hintQuerySchema, req)),
  );
});
