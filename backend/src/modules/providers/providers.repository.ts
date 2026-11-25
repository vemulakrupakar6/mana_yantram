import type { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import {
  requiredDocuments,
  type PolicyCategory,
  type PolicyEquipment,
} from "./documents.policy.js";

/**
 * FR-PRV-12: only approved providers with at least one active equipment may appear in search.
 * The future search module must build its query on this filter.
 */
export function listableProviderWhere(): Prisma.ProviderWhereInput {
  return { status: "APPROVED", equipment: { some: { status: "ACTIVE" } } };
}

export type Client = Prisma.TransactionClient | typeof database;

/** Row-level lock so state changes and edits on one provider are serialised. */
export async function lockProvider(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM providers WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.provider.findUnique({ where: { id } });
}
export async function providerIdOfUser(userId: string, client: Client = database) {
  const provider = await client.provider.findUnique({ where: { userId }, select: { id: true } });
  if (!provider)
    throw new AppError(409, "PROFILE_REQUIRED", "Complete your provider profile first.");
  return provider.id;
}
/** Lock the caller's own provider row (404-safe: it is derived from the session, never a parameter). */
export async function lockOwnProvider(tx: Prisma.TransactionClient, userId: string) {
  const found = await tx.provider.findUnique({ where: { userId }, select: { id: true } });
  if (!found) throw new AppError(409, "PROFILE_REQUIRED", "Complete your provider profile first.");
  const provider = await lockProvider(tx, found.id);
  if (!provider)
    throw new AppError(409, "PROFILE_REQUIRED", "Complete your provider profile first.");
  return provider;
}

export async function activeEquipmentForPolicy(
  providerId: string,
  client: Client = database,
): Promise<PolicyEquipment[]> {
  const rows = await client.equipment.findMany({
    where: { providerId, status: "ACTIVE" },
    select: { id: true, categoryId: true, make: true, model: true, year: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    label: `${r.make} ${r.model} (${r.year})`,
  }));
}
export async function policyCategories(client: Client = database): Promise<PolicyCategory[]> {
  const rows = await client.serviceCategory.findMany({
    where: { isActive: true },
    select: {
      id: true,
      documentTypes: {
        where: { documentType: { isActive: true } },
        select: { documentType: { select: { code: true, scope: true } } },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    documentTypes: row.documentTypes.map((d) => d.documentType),
  }));
}
export async function requiredDocumentsFor(
  provider: { id: string; type: Parameters<typeof requiredDocuments>[0] },
  client: Client = database,
) {
  return requiredDocuments(
    provider.type,
    await activeEquipmentForPolicy(provider.id, client),
    await policyCategories(client),
  );
}
