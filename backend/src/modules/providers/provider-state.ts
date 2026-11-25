import type { ProviderStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

/** Sections of a provider application that have different edit rules (plan section 8.2). */
export type ProviderSection =
  "profile" | "equipment" | "equipmentDocuments" | "coverage" | "operators";

const open: Record<ProviderSection, readonly ProviderStatus[]> = {
  // Profile, provider-scope documents and bank details: read-only after approval (FR-PRV-14 not built).
  profile: ["DRAFT", "RETURNED"],
  equipment: ["DRAFT", "RETURNED", "APPROVED", "SUSPENDED"],
  equipmentDocuments: ["DRAFT", "RETURNED", "APPROVED", "SUSPENDED"],
  coverage: ["DRAFT", "RETURNED", "APPROVED", "SUSPENDED"],
  // Operators and availability blocks stay editable everywhere except the two terminal states.
  operators: ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED", "SUSPENDED"],
};
export const isEditable = (status: ProviderStatus, section: ProviderSection) =>
  open[section].includes(status);

/** Single place that decides whether a provider-owned section may change. Throws 409 INVALID_STATE. */
export function assertProviderEditable(
  provider: { status: ProviderStatus },
  section: ProviderSection,
) {
  if (!isEditable(provider.status, section))
    throw new AppError(
      409,
      "INVALID_STATE",
      "This section cannot be edited while the application is " +
        provider.status.toLowerCase() +
        ".",
    );
}
