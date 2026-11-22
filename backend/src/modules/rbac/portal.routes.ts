import { Router, type RequestHandler } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requirePermission } from "../../middleware/authorize.js";
import { success } from "../../common/responses/success.js";
import { departmentRoles, portalPermissions } from "./roles.js";

export const portalRoutes = Router();
const access: RequestHandler = (req, res) => {
  success(res, "Portal access granted.", { roles: req.auth!.roles });
};
// Jurisdiction can be checked after role and permission once geographic masters exist.
portalRoutes.get(
  "/farmer",
  authenticate,
  authorize("FARMER"),
  requirePermission(portalPermissions.FARMER),
  access,
);
portalRoutes.get(
  "/provider",
  authenticate,
  authorize("PROVIDER"),
  requirePermission(portalPermissions.PROVIDER),
  access,
);
portalRoutes.get(
  "/admin",
  authenticate,
  authorize(...departmentRoles),
  requirePermission(portalPermissions.DEPARTMENT),
  access,
);
