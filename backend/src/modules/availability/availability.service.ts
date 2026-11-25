import { Prisma } from "@prisma/client";
import { z } from "zod";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { audit } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { assertProviderEditable } from "../providers/provider-state.js";
import { lockOwnProvider, providerIdOfUser } from "../providers/providers.repository.js";

const DAY = 86_400_000;

export const blockSchema = z
  .strictObject({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(200),
  })
  .superRefine((input, ctx) => {
    const start = Date.parse(input.startsAt);
    const end = Date.parse(input.endsAt);
    if (end <= start)
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end must be after the start.",
      });
    else if (end - start > 180 * DAY)
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "A block can last at most 180 days.",
      });
    if (end <= Date.now())
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The block must end in the future.",
      });
  });
export const rangeSchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .transform((q, ctx) => {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 92 * DAY);
    if (to <= from)
      ctx.addIssue({ code: "custom", path: ["to"], message: "'to' must be after 'from'." });
    if (to.getTime() - from.getTime() > 92 * DAY)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The range can cover at most 92 days.",
      });
    return { from, to };
  });
export type BlockInput = z.infer<typeof blockSchema>;

const blockSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  reason: true,
  createdAt: true,
  unit: {
    select: {
      id: true,
      unitLabel: true,
      equipment: { select: { id: true, make: true, model: true } },
    },
  },
} satisfies Prisma.AvailabilityBlockSelect;
const present = (row: Prisma.AvailabilityBlockGetPayload<{ select: typeof blockSelect }>) => ({
  id: row.id,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  reason: row.reason,
  createdAt: row.createdAt,
  unitId: row.unit.id,
  unitLabel: row.unit.unitLabel,
  equipment: row.unit.equipment,
});
const overlapping = (from: Date, to: Date): Prisma.AvailabilityBlockWhereInput => ({
  startsAt: { lt: to },
  endsAt: { gt: from },
});

export async function listAll(user: UserSummary, range: { from: Date; to: Date }) {
  const providerId = await providerIdOfUser(user.id);
  const rows = await database.availabilityBlock.findMany({
    where: { unit: { equipment: { providerId } }, ...overlapping(range.from, range.to) },
    select: blockSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(present);
}
/** The unit must belong to the caller's provider, or it does not exist. */
async function ownedUnit(
  client: Prisma.TransactionClient | typeof database,
  providerId: string,
  unitId: string,
) {
  const unit = await client.equipmentUnit.findFirst({
    where: { id: unitId, equipment: { providerId } },
    select: { id: true },
  });
  if (!unit) throw new AppError(404, "NOT_FOUND", "Resource not found.");
}
export async function listForUnit(
  user: UserSummary,
  unitId: string,
  range: { from: Date; to: Date },
) {
  const providerId = await providerIdOfUser(user.id);
  await ownedUnit(database, providerId, unitId);
  const rows = await database.availabilityBlock.findMany({
    where: { equipmentUnitId: unitId, ...overlapping(range.from, range.to) },
    select: blockSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(present);
}
export async function createBlock(
  user: UserSummary,
  unitId: string,
  input: BlockInput,
  details: RequestDetails,
) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "operators"); // availability follows the operators rule
    await ownedUnit(tx, provider.id, unitId);
    // Serialises every writer for this unit (a future booking module takes the same lock).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"unit:" + unitId}))`;
    const clash = await tx.availabilityBlock.findFirst({
      where: { equipmentUnitId: unitId, ...overlapping(startsAt, endsAt) },
      select: { id: true },
    });
    if (clash)
      throw new AppError(409, "BLOCK_OVERLAP", "That period overlaps an existing block.", [
        { field: "startsAt", message: "That period overlaps an existing block." },
      ]);
    const block = await tx.availabilityBlock.create({
      data: {
        equipmentUnitId: unitId,
        startsAt,
        endsAt,
        reason: input.reason,
        createdById: user.id,
      },
      select: { id: true },
    });
    await audit(tx, details, "AVAILABILITY_BLOCK_CREATED", user.id, {
      entityType: "unit",
      entityId: unitId,
      metadata: { blockId: block.id },
    });
    return block.id;
  });
  return present(
    await database.availabilityBlock.findUniqueOrThrow({ where: { id }, select: blockSelect }),
  );
}
export async function deleteBlock(
  user: UserSummary,
  unitId: string,
  blockId: string,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "operators");
    await ownedUnit(tx, provider.id, unitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"unit:" + unitId}))`;
    const result = await tx.availabilityBlock.deleteMany({
      where: { id: blockId, equipmentUnitId: unitId },
    });
    if (result.count !== 1) throw new AppError(404, "NOT_FOUND", "Resource not found.");
    await audit(tx, details, "AVAILABILITY_BLOCK_DELETED", user.id, {
      entityType: "unit",
      entityId: unitId,
      metadata: { blockId },
    });
  });
}
