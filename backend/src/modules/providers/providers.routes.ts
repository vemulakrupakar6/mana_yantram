import { Router, type Request } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { validate } from "../../middleware/validate.js";
import * as service from "./providers.service.js";
import {
  bankAccountSchema,
  coverageSchema,
  workingHoursSchema,
  documentUploadSchema,
  providerProfilePatchSchema,
  providerProfileSchema,
} from "./providers.schema.js";

const details = (req: Request) => ({ requestId: String(req.id), ipAddress: req.ip });
const uuidParam = (req: Request, name: string) => {
  const parsed = z.uuid().safeParse(req.params[name]);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};

/** /providers/me: the signed-in provider's own application. Ownership comes from the session. */
export const providersRoutes = Router();
providersRoutes.use(authenticate, authorize("PROVIDER"));
providersRoutes.post(
  "/me",
  protectCookieOperation,
  validate(providerProfileSchema),
  async (req, res) => {
    success(
      res,
      "Provider profile created.",
      await service.createProfile(req.auth!, req.body, details(req)),
      201,
    );
  },
);
providersRoutes.get("/me", async (req, res) => {
  success(res, "Provider profile.", await service.getMine(req.auth!));
});
providersRoutes.patch(
  "/me",
  protectCookieOperation,
  validate(providerProfilePatchSchema),
  async (req, res) => {
    success(
      res,
      "Provider profile updated.",
      await service.updateProfile(req.auth!, req.body, details(req)),
    );
  },
);
providersRoutes.get("/me/documents", async (req, res) => {
  success(res, "Documents.", await service.listDocuments(req.auth!));
});
providersRoutes.put(
  "/me/documents",
  protectCookieOperation,
  validate(documentUploadSchema),
  async (req, res) => {
    success(res, "Document saved.", await service.putDocument(req.auth!, req.body, details(req)));
  },
);
providersRoutes.delete("/me/documents/:id", protectCookieOperation, async (req, res) => {
  await service.deleteDocument(req.auth!, uuidParam(req, "id"), details(req));
  success(res, "Document removed.");
});
providersRoutes.put(
  "/me/bank-account",
  protectCookieOperation,
  validate(bankAccountSchema),
  async (req, res) => {
    success(
      res,
      "Bank account saved.",
      await service.putBankAccount(req.auth!, req.body, details(req)),
    );
  },
);
providersRoutes.get("/me/checklist", async (req, res) => {
  success(res, "Submission checklist.", await service.getChecklist(req.auth!));
});
providersRoutes.put(
  "/me/coverage",
  protectCookieOperation,
  validate(coverageSchema),
  async (req, res) => {
    success(res, "Coverage saved.", await service.putCoverage(req.auth!, req.body, details(req)));
  },
);
providersRoutes.put(
  "/me/working-hours",
  protectCookieOperation,
  validate(workingHoursSchema),
  async (req, res) => {
    success(
      res,
      "Working hours saved.",
      await service.putWorkingHours(req.auth!, req.body, details(req)),
    );
  },
);
providersRoutes.post("/me/submit", protectCookieOperation, async (req, res) => {
  success(res, "Application submitted.", await service.submitApplication(req.auth!, details(req)));
});
providersRoutes.get("/me/verification-history", async (req, res) => {
  success(res, "Verification history.", await service.getHistory(req.auth!));
});
