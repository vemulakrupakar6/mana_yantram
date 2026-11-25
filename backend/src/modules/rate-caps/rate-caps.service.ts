import { Prisma, type PricingBasis } from "@prisma/client";
import { z } from "zod";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { uniqueConstraint } from "../../utils/prisma-errors.js";
import { audit } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";

type Client = Prisma.TransactionClient | typeof database;
const SETTING = "rateCapsEnabled";
const invalid = (field: string, message: string, status = 422, code = "VALIDATION_ERROR") =>
  new AppError(status, code, message, [{ field, message }]);

/* ------------------------------ shared lookups ------------------------------ */

export async function rateCapsEnabled(client: Client = database) {
  return (await client.appSetting.findUnique({ where: { key: SETTING } }))?.value === true;
}
export interface CapQuery {
  categoryId: string;
  operationId: string;
  districtId: string;
  pricingBasis: PricingBasis;
}
/** The district's own cap wins; otherwise the statewide cap (no district). Inactive caps are ignored. */
export async function applicableCap(client: Client, query: CapQuery) {
  const base = {
    categoryId: query.categoryId,
    operationId: query.operationId,
    pricingBasis: query.pricingBasis,
    isActive: true,
  };
  const district = await client.rateCap.findFirst({
    where: { ...base, districtId: query.districtId },
  });
  if (district) return { maxRatePaise: district.maxRatePaise, scope: "DISTRICT" as const };
  const statewide = await client.rateCap.findFirst({ where: { ...base, districtId: null } });
  return statewide ? { maxRatePaise: statewide.maxRatePaise, scope: "STATEWIDE" as const } : null;
}
/** Throws `RATE_ABOVE_CAP` on the `ratePaise` field. Does nothing while the feature is off. */
export async function assertWithinRateCap(client: Client, query: CapQuery & { ratePaise: number }) {
  if (!(await rateCapsEnabled(client))) return;
  const cap = await applicableCap(client, query);
  if (cap && query.ratePaise > cap.maxRatePaise)
    throw invalid(
      "ratePaise",
      "The rate is above the allowed maximum of ₹" + (cap.maxRatePaise / 100).toFixed(2) + ".",
      422,
      "RATE_ABOVE_CAP",
    );
}

/** What a provider sees next to the rate field: nothing unless caps are on and one applies. */
export async function capHint(user: UserSummary, input: Omit<CapQuery, "districtId">) {
  const provider = await database.provider.findUnique({
    where: { userId: user.id },
    select: { districtId: true },
  });
  if (!provider)
    throw new AppError(409, "PROFILE_REQUIRED", "Complete your provider profile first.");
  const enabled = await rateCapsEnabled();
  const cap = enabled
    ? await applicableCap(database, { ...input, districtId: provider.districtId })
    : null;
  return { enabled, maxRatePaise: cap?.maxRatePaise ?? null, scope: cap?.scope ?? null };
}

/* ---------------------------------- admin ---------------------------------- */

export const hintQuerySchema = z.object({
  categoryId: z.uuid(),
  operationId: z.uuid(),
  pricingBasis: z.enum(["ACRE", "HOUR", "DAY"]),
});
export const enabledSchema = z.strictObject({ enabled: z.boolean() });
const maxRate = z.number().int().min(100).max(1_000_000_00);
export const createCapSchema = z.strictObject({
  categoryId: z.uuid(),
  operationId: z.uuid(),
  districtId: z.uuid().optional(),
  pricingBasis: z.enum(["ACRE", "HOUR", "DAY"]),
  maxRatePaise: maxRate,
});
export const updateCapSchema = z
  .strictObject({ maxRatePaise: maxRate, isActive: z.boolean() })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field." });
export const listCapsSchema = z.object({
  categoryId: z.uuid().optional(),
  operationId: z.uuid().optional(),
  districtId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const capSelect = {
  id: true,
  pricingBasis: true,
  maxRatePaise: true,
  isActive: true,
  category: { select: { id: true, code: true, nameEn: true, nameTe: true } },
  operation: { select: { id: true, code: true, nameEn: true, nameTe: true } },
  district: { select: { id: true, nameEn: true, nameTe: true } },
} satisfies Prisma.RateCapSelect;

export async function getEnabled() {
  return { enabled: await rateCapsEnabled() };
}
export async function setEnabled(user: UserSummary, enabled: boolean, details: RequestDetails) {
  await database.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: SETTING },
      create: { key: SETTING, value: enabled, updatedById: user.id },
      update: { value: enabled, updatedById: user.id },
    });
    await audit(tx, details, "RATE_CAPS_TOGGLED", user.id, {
      entityType: "setting",
      metadata: { enabled },
    });
  });
  return getEnabled();
}
export async function listCaps(query: z.infer<typeof listCapsSchema>) {
  const where: Prisma.RateCapWhereInput = {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.operationId ? { operationId: query.operationId } : {}),
    ...(query.districtId ? { districtId: query.districtId } : {}),
  };
  const total = await database.rateCap.count({ where });
  const items = await database.rateCap.findMany({
    where,
    select: capSelect,
    orderBy: [
      { category: { sortOrder: "asc" } },
      { operation: { nameEn: "asc" } },
      { pricingBasis: "asc" },
      { id: "asc" },
    ],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  return { items, page: query.page, pageSize: query.pageSize, total };
}
const capExists = () =>
  invalid(
    "operationId",
    "A cap already exists for that category, operation, district and basis.",
    409,
    "CAP_EXISTS",
  );

export async function createCap(
  user: UserSummary,
  input: z.infer<typeof createCapSchema>,
  details: RequestDetails,
) {
  try {
    const id = await database.$transaction(async (tx) => {
      const mapped = await tx.categoryOperation.findFirst({
        where: { categoryId: input.categoryId, operationId: input.operationId },
        select: { categoryId: true },
      });
      if (!mapped) throw invalid("operationId", "That operation is not offered for that category.");
      if (input.districtId) {
        const district = await tx.district.findFirst({
          where: { id: input.districtId, isActive: true },
          select: { id: true },
        });
        if (!district) throw invalid("districtId", "Unknown district.");
      }
      // The database index treats a missing district as a value, so check before inserting.
      const clash = await tx.rateCap.findFirst({
        where: {
          categoryId: input.categoryId,
          operationId: input.operationId,
          pricingBasis: input.pricingBasis,
          districtId: input.districtId ?? null,
        },
        select: { id: true },
      });
      if (clash) throw capExists();
      const cap = await tx.rateCap.create({
        data: { ...input, districtId: input.districtId ?? null },
        select: { id: true },
      });
      await audit(tx, details, "RATE_CAP_CREATED", user.id, {
        entityType: "rate_cap",
        entityId: cap.id,
        metadata: {
          maxRatePaise: input.maxRatePaise,
          scope: input.districtId ? "DISTRICT" : "STATEWIDE",
        },
      });
      return cap.id;
    });
    return await database.rateCap.findUniqueOrThrow({ where: { id }, select: capSelect });
  } catch (error) {
    if (uniqueConstraint(error)?.includes("uq_rate_cap")) throw capExists();
    throw error;
  }
}
export async function updateCap(
  user: UserSummary,
  id: string,
  input: z.infer<typeof updateCapSchema>,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const result = await tx.rateCap.updateMany({ where: { id }, data: input });
    if (result.count !== 1) throw new AppError(404, "NOT_FOUND", "Resource not found.");
    await audit(tx, details, "RATE_CAP_UPDATED", user.id, {
      entityType: "rate_cap",
      entityId: id,
      metadata: input,
    });
  });
  return database.rateCap.findUniqueOrThrow({ where: { id }, select: capSelect });
}
