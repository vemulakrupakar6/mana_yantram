import type { JurisdictionLevel } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import type { UserSummary } from "../auth/auth.types.js";

export interface Jurisdiction {
  level: JurisdictionLevel;
  districtId: string | null;
  mandalId: string | null;
}
const NOTHING = "00000000-0000-0000-0000-000000000000";

/**
 * Prisma `where` fragment for rows that carry districtId / mandalId columns
 * (farmers, providers). Fails closed for users without a jurisdiction row.
 */
export function jurisdictionWhere(user: Pick<UserSummary, "jurisdiction">) {
  const scope = user.jurisdiction;
  if (!scope) return { id: NOTHING };
  if (scope.level === "STATE") return {};
  if (scope.level === "DISTRICT") return { districtId: scope.districtId! };
  return { mandalId: scope.mandalId! };
}
/** For writes where the caller supplies the location. */
export function isInJurisdiction(
  user: Pick<UserSummary, "jurisdiction">,
  location: { districtId?: string | null; mandalId?: string | null },
) {
  const scope = user.jurisdiction;
  if (!scope) return false;
  if (scope.level === "STATE") return true;
  if (scope.level === "DISTRICT") return location.districtId === scope.districtId;
  return location.mandalId === scope.mandalId;
}
export function assertInJurisdiction(
  user: Pick<UserSummary, "jurisdiction">,
  location: { districtId?: string | null; mandalId?: string | null },
) {
  if (!isInJurisdiction(user, location))
    throw new AppError(403, "OUT_OF_JURISDICTION", "That location is outside your jurisdiction.");
}
