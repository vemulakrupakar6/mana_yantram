import { Router, type Request } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import * as service from "./operators.service.js";
import {
  createOperatorSchema,
  operatorEquipmentSchema,
  resetOperatorPasswordSchema,
  updateOperatorSchema,
} from "./operators.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const id = (req: Request) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};

/** Mounted at /providers/me/operators. */
export const providerOperatorsRoutes = Router();
providerOperatorsRoutes.use(authenticate, authorize("PROVIDER"));
const write = protectCookieOperation;
providerOperatorsRoutes.get("/", async (req, res) => {
  success(res, "Operators.", await service.listOperators(req.auth!));
});
providerOperatorsRoutes.post("/", write, validate(createOperatorSchema), async (req, res) => {
  success(
    res,
    "Operator created.",
    await service.createOperator(req.auth!, req.body, details(req)),
    201,
  );
});
providerOperatorsRoutes.get("/:id", async (req, res) => {
  success(res, "Operator.", await service.getOperator(req.auth!, id(req)));
});
providerOperatorsRoutes.patch("/:id", write, validate(updateOperatorSchema), async (req, res) => {
  success(
    res,
    "Operator updated.",
    await service.updateOperator(req.auth!, id(req), req.body, details(req)),
  );
});
providerOperatorsRoutes.put(
  "/:id/equipment",
  write,
  validate(operatorEquipmentSchema),
  async (req, res) => {
    success(
      res,
      "Assigned equipment updated.",
      await service.setOperatorEquipment(req.auth!, id(req), req.body.equipmentIds, details(req)),
    );
  },
);
providerOperatorsRoutes.post("/:id/deactivate", write, async (req, res) => {
  success(
    res,
    "Operator deactivated.",
    await service.deactivateOperator(req.auth!, id(req), details(req)),
  );
});
providerOperatorsRoutes.post("/:id/activate", write, async (req, res) => {
  success(
    res,
    "Operator activated.",
    await service.activateOperator(req.auth!, id(req), details(req)),
  );
});
providerOperatorsRoutes.post(
  "/:id/reset-password",
  write,
  validate(resetOperatorPasswordSchema),
  async (req, res) => {
    success(
      res,
      "Password reset. The operator must change it at next sign-in.",
      await service.resetOperatorPassword(
        req.auth!,
        id(req),
        req.body.temporaryPassword,
        details(req),
      ),
    );
  },
);

/** Mounted at /operator: the signed-in operator's own view. */
export const operatorSelfRoutes = Router();
operatorSelfRoutes.use(authenticate, authorize("OPERATOR"));
operatorSelfRoutes.get("/me", async (req, res) => {
  success(res, "Operator profile.", await service.operatorMe(req.auth!));
});
