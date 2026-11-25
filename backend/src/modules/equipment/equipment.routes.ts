import { Router, type Request } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import * as service from "./equipment.service.js";
import {
  addUnitsSchema,
  createEquipmentSchema,
  photosSchema,
  servicePatchSchema,
  serviceSchema,
  updateEquipmentSchema,
  updateUnitSchema,
} from "./equipment.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const id = (req: Request, name: string) => {
  const parsed = z.uuid().safeParse(req.params[name]);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};

/** Mounted at /providers/me/equipment. Ownership is derived from the session. */
export const equipmentRoutes = Router();
equipmentRoutes.use(authenticate, authorize("PROVIDER"));
const write = protectCookieOperation;

equipmentRoutes.get("/", async (req, res) => {
  success(res, "Equipment.", await service.listEquipment(req.auth!));
});
equipmentRoutes.post("/", write, validate(createEquipmentSchema), async (req, res) => {
  success(
    res,
    "Equipment created.",
    await service.createEquipment(req.auth!, req.body, details(req)),
    201,
  );
});
equipmentRoutes.get("/:id", async (req, res) => {
  success(res, "Equipment.", await service.getEquipment(req.auth!, id(req, "id")));
});
equipmentRoutes.patch("/:id", write, validate(updateEquipmentSchema), async (req, res) => {
  success(
    res,
    "Equipment updated.",
    await service.updateEquipment(req.auth!, id(req, "id"), req.body, details(req)),
  );
});
equipmentRoutes.post("/:id/deactivate", write, async (req, res) => {
  success(
    res,
    "Equipment deactivated.",
    await service.deactivateEquipment(req.auth!, id(req, "id"), details(req)),
  );
});
equipmentRoutes.post("/:id/activate", write, async (req, res) => {
  success(
    res,
    "Equipment activated.",
    await service.activateEquipment(req.auth!, id(req, "id"), details(req)),
  );
});
equipmentRoutes.put("/:id/photos", write, validate(photosSchema), async (req, res) => {
  success(
    res,
    "Photos updated.",
    await service.setPhotos(req.auth!, id(req, "id"), req.body.fileIds, details(req)),
  );
});

equipmentRoutes.get("/:id/units", async (req, res) => {
  success(res, "Units.", await service.listUnits(req.auth!, id(req, "id")));
});
equipmentRoutes.post("/:id/units", write, validate(addUnitsSchema), async (req, res) => {
  success(
    res,
    "Units added.",
    await service.addUnits(req.auth!, id(req, "id"), req.body.count, details(req)),
    201,
  );
});
equipmentRoutes.patch("/:id/units/:unitId", write, validate(updateUnitSchema), async (req, res) => {
  success(
    res,
    "Unit updated.",
    await service.updateUnit(req.auth!, id(req, "id"), id(req, "unitId"), req.body, details(req)),
  );
});

equipmentRoutes.get("/:id/services", async (req, res) => {
  success(res, "Rate card.", await service.listServices(req.auth!, id(req, "id")));
});
equipmentRoutes.post("/:id/services", write, validate(serviceSchema), async (req, res) => {
  success(
    res,
    "Service saved.",
    await service.createService(req.auth!, id(req, "id"), req.body, details(req)),
    201,
  );
});
equipmentRoutes.patch(
  "/:id/services/:serviceId",
  write,
  validate(servicePatchSchema),
  async (req, res) => {
    success(
      res,
      "Service updated.",
      await service.updateService(
        req.auth!,
        id(req, "id"),
        id(req, "serviceId"),
        req.body,
        details(req),
      ),
    );
  },
);
equipmentRoutes.delete("/:id/services/:serviceId", write, async (req, res) => {
  await service.removeService(req.auth!, id(req, "id"), id(req, "serviceId"), details(req));
  success(res, "Service removed.");
});
