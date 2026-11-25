import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import * as service from "./availability.service.js";
import { blockSchema, rangeSchema } from "./availability.service.js";

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

/** Mounted at /providers/me. */
export const availabilityRoutes = Router();
availabilityRoutes.use(authenticate, authorize("PROVIDER"));
availabilityRoutes.get("/availability", async (req, res) => {
  success(res, "Availability blocks.", await service.listAll(req.auth!, query(rangeSchema, req)));
});
availabilityRoutes.get("/units/:unitId/blocks", async (req, res) => {
  success(
    res,
    "Availability blocks.",
    await service.listForUnit(req.auth!, uuid(req, "unitId"), query(rangeSchema, req)),
  );
});
availabilityRoutes.post(
  "/units/:unitId/blocks",
  protectCookieOperation,
  validate(blockSchema),
  async (req, res) => {
    success(
      res,
      "Block created.",
      await service.createBlock(req.auth!, uuid(req, "unitId"), req.body, details(req)),
      201,
    );
  },
);
availabilityRoutes.delete(
  "/units/:unitId/blocks/:blockId",
  protectCookieOperation,
  async (req, res) => {
    await service.deleteBlock(req.auth!, uuid(req, "unitId"), uuid(req, "blockId"), details(req));
    success(res, "Block removed.");
  },
);
