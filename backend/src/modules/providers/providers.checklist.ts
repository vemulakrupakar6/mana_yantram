import { database } from "../../config/database.js";
import { documentKey } from "./documents.policy.js";
import { requiredDocumentsFor, type Client } from "./providers.repository.js";

export const checklistKeys = [
  "profile",
  "bankAccount",
  "documents",
  "equipment",
  "coverage",
  "workingHours",
] as const;
export type ChecklistKey = (typeof checklistKeys)[number];
export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  detail?: Record<string, number | string[]>;
}

/**
 * Submission checklist (plan section 7.6.2). Operators are optional and not listed.
 *
 * This runs inside the submit transaction, so it uses simple, flat queries one after another:
 * relation-heavy reads make Prisma send overlapping queries down the transaction's single
 * connection, which the pg driver is deprecating.
 */
export async function computeChecklist(providerId: string, client: Client = database) {
  const provider = await client.provider.findUniqueOrThrow({
    where: { id: providerId },
    select: { id: true, type: true, coverageMode: true, coverageRadiusKm: true },
  });
  const bank = await client.providerBankAccount.findUnique({
    where: { providerId },
    select: { status: true },
  });
  const documents = await client.providerDocument.findMany({
    where: { providerId },
    select: { documentTypeCode: true, equipmentId: true, status: true },
  });
  const areaCount = await client.providerCoverageArea.count({ where: { providerId } });
  const hoursCount = await client.providerWorkingHours.count({ where: { providerId } });
  const equipment = await client.equipment.findMany({
    where: { providerId, status: "ACTIVE" },
    select: { id: true },
  });
  const equipmentIds = equipment.map((e) => e.id);
  const photos = await client.equipmentPhoto.findMany({
    where: { equipmentId: { in: equipmentIds } },
    select: { equipmentId: true },
  });
  const services = await client.equipmentService.findMany({
    where: { equipmentId: { in: equipmentIds }, isActive: true },
    select: { equipmentId: true },
  });
  const withPhoto = new Set(photos.map((p) => p.equipmentId));
  const withService = new Set(services.map((s) => s.equipmentId));
  const incompleteEquipment = equipmentIds.filter(
    (id) => !withPhoto.has(id) || !withService.has(id),
  ).length;

  const required = await requiredDocumentsFor(provider, client);
  const have = new Map(
    documents.map((d) => [documentKey(d.documentTypeCode, d.equipmentId), d.status]),
  );
  const missing = required
    .filter((r) => !have.has(documentKey(r.documentTypeCode, r.equipmentId)))
    .map((r) => r.documentTypeCode);
  const returned = documents.filter((d) => d.status === "RETURNED").length;
  const coverageDone =
    (provider.coverageMode === "RADIUS" && provider.coverageRadiusKm !== null) ||
    (provider.coverageMode === "AREAS" && areaCount > 0);
  const items: ChecklistItem[] = [
    { key: "profile", done: true },
    {
      key: "bankAccount",
      done: bank !== null && bank.status !== "RETURNED",
      detail: { returned: bank?.status === "RETURNED" ? 1 : 0 },
    },
    {
      key: "documents",
      done: missing.length === 0 && returned === 0,
      detail: { missing, returned },
    },
    {
      key: "equipment",
      done: equipmentIds.length > 0 && incompleteEquipment === 0,
      detail: { active: equipmentIds.length, incomplete: incompleteEquipment },
    },
    { key: "coverage", done: coverageDone },
    { key: "workingHours", done: hoursCount > 0 },
  ];
  return { items, canSubmit: items.every((item) => item.done) };
}
