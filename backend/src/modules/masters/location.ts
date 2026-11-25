import type { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";

export interface LocationIds {
  districtId: string;
  mandalId: string;
  villageId: string;
}
/**
 * Verifies district → mandal → village are all active and nested correctly.
 * Throws 422 VALIDATION_ERROR with per-field errors otherwise.
 */
export async function assertLocationHierarchy(
  client: Prisma.TransactionClient | typeof database,
  { districtId, mandalId, villageId }: LocationIds,
) {
  // The client may be a transaction, which has a single connection: run the lookups in order.
  const district = await client.district.findFirst({
    where: { id: districtId, isActive: true },
    select: { id: true },
  });
  const mandal = await client.mandal.findFirst({
    where: { id: mandalId, isActive: true },
    select: { id: true, districtId: true },
  });
  const village = await client.village.findFirst({
    where: { id: villageId, isActive: true },
    select: { id: true, mandalId: true },
  });
  const errors: { field: string; message: string }[] = [];
  if (!district) errors.push({ field: "districtId", message: "Unknown district." });
  if (!mandal) errors.push({ field: "mandalId", message: "Unknown mandal." });
  else if (district && mandal.districtId !== districtId)
    errors.push({ field: "mandalId", message: "That mandal is not in the district." });
  if (!village) errors.push({ field: "villageId", message: "Unknown village." });
  else if (mandal && village.mandalId !== mandalId)
    errors.push({ field: "villageId", message: "That village is not in the mandal." });
  if (errors.length) throw new AppError(422, "VALIDATION_ERROR", "Validation failed.", errors);
}
