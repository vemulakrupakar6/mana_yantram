import type { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { hashPassword } from "../../utils/password.js";
import { uniqueConstraint } from "../../utils/prisma-errors.js";
import { audit, lockUser, revokeSessions } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { attachFile, detachAndDelete, present as presentFile } from "../files/files.service.js";
import { assertProviderEditable } from "../providers/provider-state.js";
import { lockOwnProvider, providerIdOfUser } from "../providers/providers.repository.js";
import type { CreateOperatorInput, UpdateOperatorInput } from "./operators.schema.js";

type Tx = Prisma.TransactionClient;
const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const invalid = (field: string, message: string) =>
  new AppError(422, "VALIDATION_ERROR", "Validation failed.", [{ field, message }]);

const operatorSelect = {
  id: true,
  fullName: true,
  licenceNo: true,
  status: true,
  createdAt: true,
  user: { select: { username: true, mobile: true, mustChangePassword: true } },
  licenceFile: {
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, bucket: true },
  },
  equipment: {
    select: { equipment: { select: { id: true, make: true, model: true, year: true } } },
  },
} satisfies Prisma.OperatorSelect;
type Row = Prisma.OperatorGetPayload<{ select: typeof operatorSelect }>;
const present = (row: Row) => ({
  id: row.id,
  fullName: row.fullName,
  licenceNo: row.licenceNo,
  status: row.status,
  createdAt: row.createdAt,
  username: row.user.username,
  mobile: row.user.mobile,
  mustChangePassword: row.user.mustChangePassword,
  licenceFile: row.licenceFile ? presentFile(row.licenceFile) : null,
  equipment: row.equipment.map((e) => e.equipment),
});
async function load(providerId: string, id: string) {
  const row = await database.operator.findFirst({
    where: { id, providerId },
    select: operatorSelect,
  });
  if (!row) throw notFound();
  return present(row);
}
async function assertOwnEquipment(tx: Tx, providerId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return unique;
  const found = await tx.equipment.count({ where: { id: { in: unique }, providerId } });
  if (found !== unique.length)
    throw invalid("equipmentIds", "One of the equipment items is unknown.");
  return unique;
}
function translateUnique(error: unknown): never {
  const target = uniqueConstraint(error);
  if (target?.includes("mobile"))
    throw new AppError(409, "MOBILE_TAKEN", "That mobile number is already in use.", [
      { field: "mobile", message: "That mobile number is already in use." },
    ]);
  if (target?.includes("username"))
    throw new AppError(409, "USERNAME_TAKEN", "That username is already taken.", [
      { field: "username", message: "That username is already taken." },
    ]);
  throw error;
}
const audited = (
  tx: Tx,
  details: RequestDetails,
  actor: UserSummary,
  action: string,
  operatorId: string,
  metadata?: Prisma.InputJsonObject,
) =>
  audit(tx, details, action, actor.id, { entityType: "operator", entityId: operatorId, metadata });

/* ------------------------------ provider side ------------------------------ */

export async function listOperators(user: UserSummary) {
  const providerId = await providerIdOfUser(user.id);
  const rows = await database.operator.findMany({
    where: { providerId },
    select: operatorSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(present);
}
export async function getOperator(user: UserSummary, id: string) {
  return load(await providerIdOfUser(user.id), id);
}

export async function createOperator(
  user: UserSummary,
  input: CreateOperatorInput,
  details: RequestDetails,
) {
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    const created = await database.$transaction(async (tx) => {
      const provider = await lockOwnProvider(tx, user.id);
      assertProviderEditable(provider, "operators");
      const role = await tx.role.findUnique({ where: { code: "OPERATOR" }, select: { id: true } });
      if (!role) throw new AppError(503, "ROLE_UNAVAILABLE", "Operator accounts are unavailable.");
      const equipmentIds = await assertOwnEquipment(tx, provider.id, input.equipmentIds ?? []);
      const account = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.fullName,
          mobile: input.mobile,
          passwordHash,
          mustChangePassword: true,
          createdById: user.id,
        },
        select: { id: true },
      });
      await tx.userRole.create({ data: { userId: account.id, roleId: role.id } });
      await tx.userRoleOnboarding.create({
        data: { userId: account.id, roleId: role.id, status: "COMPLETED", completedAt: new Date() },
      });
      const operator = await tx.operator.create({
        data: {
          userId: account.id,
          providerId: provider.id,
          fullName: input.fullName,
          licenceNo: input.licenceNo,
        },
        select: { id: true },
      });
      if (input.licenceFileId) {
        await attachFile(tx, {
          fileId: input.licenceFileId,
          userId: user.id,
          bucket: "DOCUMENT",
          entityType: "operator",
          entityId: operator.id,
        });
        await tx.operator.update({
          where: { id: operator.id },
          data: { licenceFileId: input.licenceFileId },
        });
      }
      if (equipmentIds.length)
        await tx.operatorEquipment.createMany({
          data: equipmentIds.map((equipmentId) => ({ operatorId: operator.id, equipmentId })),
        });
      await audited(tx, details, user, "OPERATOR_CREATED", operator.id, {
        equipment: equipmentIds.length,
      });
      return { providerId: provider.id, id: operator.id };
    });
    return await load(created.providerId, created.id);
  } catch (error) {
    return translateUnique(error);
  }
}
export async function updateOperator(
  user: UserSummary,
  id: string,
  input: UpdateOperatorInput,
  details: RequestDetails,
) {
  try {
    const providerId = await database.$transaction(async (tx) => {
      const provider = await lockOwnProvider(tx, user.id);
      assertProviderEditable(provider, "operators");
      const operator = await tx.operator.findFirst({
        where: { id, providerId: provider.id },
        select: { id: true, userId: true, licenceFileId: true },
      });
      if (!operator) throw notFound();
      let licenceFileId: string | null | undefined;
      if (input.licenceFileId !== undefined) {
        if (operator.licenceFileId && operator.licenceFileId !== input.licenceFileId)
          await detachAndDelete(tx, operator.licenceFileId);
        if (input.licenceFileId && input.licenceFileId !== operator.licenceFileId)
          await attachFile(tx, {
            fileId: input.licenceFileId,
            userId: user.id,
            bucket: "DOCUMENT",
            entityType: "operator",
            entityId: operator.id,
          });
        licenceFileId = input.licenceFileId;
      }
      if (input.mobile !== undefined || input.fullName !== undefined)
        await tx.user.update({
          where: { id: operator.userId },
          data: {
            ...(input.mobile !== undefined ? { mobile: input.mobile, mobileVerified: false } : {}),
            ...(input.fullName !== undefined ? { displayName: input.fullName } : {}),
          },
        });
      await tx.operator.update({
        where: { id },
        data: { fullName: input.fullName, licenceNo: input.licenceNo, licenceFileId },
      });
      await audited(tx, details, user, "OPERATOR_UPDATED", id, { fields: Object.keys(input) });
      return provider.id;
    });
    return await load(providerId, id);
  } catch (error) {
    return translateUnique(error);
  }
}
export async function setOperatorEquipment(
  user: UserSummary,
  id: string,
  equipmentIds: string[],
  details: RequestDetails,
) {
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "operators");
    if (!(await tx.operator.count({ where: { id, providerId: provider.id } }))) throw notFound();
    const ids = await assertOwnEquipment(tx, provider.id, equipmentIds);
    await tx.operatorEquipment.deleteMany({ where: { operatorId: id } });
    if (ids.length)
      await tx.operatorEquipment.createMany({
        data: ids.map((equipmentId) => ({ operatorId: id, equipmentId })),
      });
    await audited(tx, details, user, "OPERATOR_EQUIPMENT_UPDATED", id, { count: ids.length });
    return provider.id;
  });
  return load(providerId, id);
}
async function setOperatorStatus(
  user: UserSummary,
  id: string,
  status: "ACTIVE" | "INACTIVE",
  details: RequestDetails,
) {
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "operators");
    const operator = await tx.operator.findFirst({
      where: { id, providerId: provider.id },
      select: { id: true, userId: true },
    });
    if (!operator) throw notFound();
    if (!(await lockUser(tx, operator.userId))) throw notFound();
    await tx.operator.update({ where: { id }, data: { status } });
    if (status === "INACTIVE") {
      const now = new Date();
      await tx.user.update({
        where: { id: operator.userId },
        data: {
          status: "INACTIVE",
          deactivatedAt: now,
          deactivatedById: user.id,
          deactivationReason: "Deactivated by the provider",
        },
      });
      await revokeSessions(tx, operator.userId, now);
    } else {
      await tx.user.update({
        where: { id: operator.userId },
        data: {
          status: "ACTIVE",
          deactivatedAt: null,
          deactivatedById: null,
          deactivationReason: null,
        },
      });
    }
    await audited(
      tx,
      details,
      user,
      status === "INACTIVE" ? "OPERATOR_DEACTIVATED" : "OPERATOR_ACTIVATED",
      id,
    );
    return provider.id;
  });
  return load(providerId, id);
}
export const deactivateOperator = (u: UserSummary, id: string, d: RequestDetails) =>
  setOperatorStatus(u, id, "INACTIVE", d);
export const activateOperator = (u: UserSummary, id: string, d: RequestDetails) =>
  setOperatorStatus(u, id, "ACTIVE", d);

export async function resetOperatorPassword(
  user: UserSummary,
  id: string,
  temporaryPassword: string,
  details: RequestDetails,
) {
  const passwordHash = await hashPassword(temporaryPassword);
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "operators");
    const operator = await tx.operator.findFirst({
      where: { id, providerId: provider.id },
      select: { userId: true },
    });
    if (!operator) throw notFound();
    await lockUser(tx, operator.userId);
    await tx.user.update({
      where: { id: operator.userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await revokeSessions(tx, operator.userId, new Date());
    await audited(tx, details, user, "OPERATOR_PASSWORD_RESET", id);
    return provider.id;
  });
  return load(providerId, id);
}

/* ------------------------------- operator side ------------------------------- */

export async function operatorMe(user: UserSummary) {
  const operator = await database.operator.findUnique({
    where: { userId: user.id },
    select: {
      fullName: true,
      licenceNo: true,
      provider: { select: { name: true, providerNo: true, status: true } },
      equipment: {
        select: {
          equipment: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              status: true,
              category: { select: { id: true, code: true, nameEn: true, nameTe: true } },
              units: {
                select: { id: true, unitLabel: true, registrationNo: true, status: true },
                orderBy: { unitLabel: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!operator) throw notFound();
  return {
    fullName: operator.fullName,
    licenceNo: operator.licenceNo,
    provider: operator.provider,
    equipment: operator.equipment.map((e) => ({
      id: e.equipment.id,
      category: e.equipment.category,
      make: e.equipment.make,
      model: e.equipment.model,
      year: e.equipment.year,
      status: e.equipment.status,
      units: e.equipment.units,
    })),
  };
}
