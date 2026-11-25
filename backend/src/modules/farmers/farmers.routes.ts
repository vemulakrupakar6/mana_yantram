import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requirePermission } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import { permissions } from "../rbac/roles.js";
import * as service from "./farmers.service.js";
import {
  adminFarmersQuery,
  assistedListQuery,
  assistedRegistrationSchema,
  farmerProfilePatchSchema,
  farmerProfileSchema,
  plotPatchSchema,
  plotSchema,
} from "./farmers.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const uuidParam = (req: Request, name: string) => {
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

/** /farmers: the signed-in farmer's own profile and plots. */
export const farmersRoutes = Router();
farmersRoutes.use(authenticate, authorize("FARMER"));
farmersRoutes.post(
  "/me",
  protectCookieOperation,
  validate(farmerProfileSchema),
  async (req, res) => {
    success(
      res,
      "Farmer profile created.",
      await service.createOwnProfile(req.auth!, req.body, details(req)),
      201,
    );
  },
);
farmersRoutes.get("/me", async (req, res) => {
  success(res, "Farmer profile.", await service.getOwnProfile(req.auth!));
});
farmersRoutes.patch(
  "/me",
  protectCookieOperation,
  validate(farmerProfilePatchSchema),
  async (req, res) => {
    success(
      res,
      "Farmer profile updated.",
      await service.updateOwnProfile(req.auth!, req.body, details(req)),
    );
  },
);
farmersRoutes.get("/me/plots", async (req, res) => {
  success(res, "Plots.", await service.listOwnPlots(req.auth!));
});
farmersRoutes.post("/me/plots", protectCookieOperation, validate(plotSchema), async (req, res) => {
  success(
    res,
    "Plot created.",
    await service.createOwnPlot(req.auth!, req.body, details(req)),
    201,
  );
});
farmersRoutes.get("/me/plots/:plotId", async (req, res) => {
  success(res, "Plot.", await service.getOwnPlot(req.auth!, uuidParam(req, "plotId")));
});
farmersRoutes.patch(
  "/me/plots/:plotId",
  protectCookieOperation,
  validate(plotPatchSchema),
  async (req, res) => {
    success(
      res,
      "Plot updated.",
      await service.updateOwnPlot(req.auth!, uuidParam(req, "plotId"), req.body, details(req)),
    );
  },
);
farmersRoutes.delete("/me/plots/:plotId", protectCookieOperation, async (req, res) => {
  await service.deleteOwnPlot(req.auth!, uuidParam(req, "plotId"), details(req));
  success(res, "Plot deleted.");
});

/** /assisted/farmers: field agents and helpdesk registering farmers on their behalf. */
export const assistedRoutes = Router();
assistedRoutes.use(authenticate, requirePermission(permissions.farmerRegisterAssisted));
assistedRoutes.post(
  "/",
  protectCookieOperation,
  validate(assistedRegistrationSchema),
  async (req, res) => {
    success(
      res,
      "Farmer registered.",
      await service.registerAssisted(req.auth!, req.body, details(req)),
      201,
    );
  },
);
assistedRoutes.get("/", async (req, res) => {
  success(res, "Farmers.", await service.listAssisted(req.auth!, query(assistedListQuery, req)));
});
assistedRoutes.get("/:id", async (req, res) => {
  success(res, "Farmer.", await service.getAssisted(req.auth!, uuidParam(req, "id")));
});
assistedRoutes.post(
  "/:id/plots",
  protectCookieOperation,
  validate(plotSchema),
  async (req, res) => {
    success(
      res,
      "Plot created.",
      await service.addAssistedPlot(req.auth!, uuidParam(req, "id"), req.body, details(req)),
      201,
    );
  },
);

/** /admin/farmers: officer views scoped by jurisdiction. */
export const adminFarmersRoutes = Router();
adminFarmersRoutes.use(authenticate, requirePermission(permissions.farmerView));
adminFarmersRoutes.get("/", async (req, res) => {
  success(res, "Farmers.", await service.listForOfficer(req.auth!, query(adminFarmersQuery, req)));
});
adminFarmersRoutes.get("/:id", async (req, res) => {
  success(res, "Farmer.", await service.getForOfficer(req.auth!, uuidParam(req, "id")));
});
