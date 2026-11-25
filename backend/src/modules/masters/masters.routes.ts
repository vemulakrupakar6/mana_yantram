import { Router } from "express";
import { z } from "zod";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { success } from "../../common/responses/success.js";

const idParam = (value: unknown) => {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return parsed.data;
};
const geoFields = { id: true, lgdCode: true, nameEn: true, nameTe: true } as const;

export const mastersRoutes = Router();
mastersRoutes.get("/districts", async (_req, res) => {
  success(
    res,
    "Districts.",
    await database.district.findMany({
      where: { isActive: true },
      select: geoFields,
      orderBy: { nameEn: "asc" },
    }),
  );
});
mastersRoutes.get("/districts/:id/mandals", async (req, res) => {
  success(
    res,
    "Mandals.",
    await database.mandal.findMany({
      where: { districtId: idParam(req.params.id), isActive: true },
      select: geoFields,
      orderBy: { nameEn: "asc" },
    }),
  );
});
mastersRoutes.get("/mandals/:id/villages", async (req, res) => {
  success(
    res,
    "Villages.",
    await database.village.findMany({
      where: { mandalId: idParam(req.params.id), isActive: true },
      select: geoFields,
      orderBy: { nameEn: "asc" },
    }),
  );
});

mastersRoutes.get("/categories", async (_req, res) => {
  const rows = await database.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameTe: true,
      requiresPilotLicence: true,
      operations: {
        where: { operation: { isActive: true } },
        select: {
          operation: {
            select: {
              id: true,
              code: true,
              nameEn: true,
              nameTe: true,
              defaultPricingBasis: true,
            },
          },
        },
      },
      documentTypes: {
        where: { documentType: { isActive: true } },
        select: { documentType: { select: { code: true, scope: true } } },
      },
    },
  });
  success(
    res,
    "Service categories.",
    rows.map(({ operations, documentTypes, ...category }) => ({
      ...category,
      operations: operations
        .map((row) => row.operation)
        .sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
      requiredDocumentTypes: documentTypes.map((row) => row.documentType),
    })),
  );
});
mastersRoutes.get("/document-types", async (_req, res) => {
  success(
    res,
    "Document types.",
    await database.documentType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, nameEn: true, nameTe: true, scope: true },
    }),
  );
});
mastersRoutes.get("/crops", async (_req, res) => {
  success(
    res,
    "Crops.",
    await database.crop.findMany({
      where: { isActive: true },
      orderBy: { nameEn: "asc" },
      select: { id: true, code: true, nameEn: true, nameTe: true },
    }),
  );
});
mastersRoutes.get("/ifsc/:ifsc", authenticate, rateLimit("ifsc", 120), async (req, res) => {
  const ifsc = String(req.params.ifsc).toUpperCase();
  const row = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)
    ? await database.ifscCode.findUnique({
        where: { ifsc },
        select: { ifsc: true, bank: true, branch: true },
      })
    : null;
  if (!row) throw new AppError(404, "NOT_FOUND", "Resource not found.");
  success(res, "IFSC details.", row);
});
