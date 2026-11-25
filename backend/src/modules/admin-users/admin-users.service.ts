import { Prisma, type RoleCode } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { uniqueConstraint } from "../../utils/prisma-errors.js";
import { hashPassword } from "../../utils/password.js";
import { audit, lockUser, revokeSessions } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { assertInJurisdiction } from "../rbac/jurisdiction.js";
import { departmentRoles, roleLevel } from "../rbac/roles.js";
import type { CreateUserInput, ListQuery } from "./admin-users.schema.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const topLevel = (roles: RoleCode[]) => Math.max(0, ...roles.map((r) => roleLevel[r]));
const callerLevel = (caller: UserSummary) => topLevel(caller.roles);
const invalid = (field: string, message: string) =>
  new AppError(422, "VALIDATION_ERROR", "Validation failed.", [{ field, message }]);

const userFields = {
  id: true,
  username: true,
  displayName: true,
  mobile: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  mustChangePassword: true,
  deactivatedAt: true,
  deactivationReason: true,
  roles: { select: { role: { select: { code: true } } } },
  jurisdiction: { select: { level: true, districtId: true, mandalId: true } },
} satisfies Prisma.UserSelect;
type Row = Prisma.UserGetPayload<{ select: typeof userFields }>;
const present = ({ roles, ...user }: Row) => ({
  ...user,
  roles: roles.map((r) => r.role.code).sort(),
});

/**
 * Which users the caller may see. STATE sees everyone. A DISTRICT or MANDAL caller sees users whose
 * own jurisdiction is inside their area, plus farmers, providers and operators located there.
 * A caller without a jurisdiction sees nothing.
 */
function scopeWhere(caller: UserSummary): Prisma.UserWhereInput {
  const scope = caller.jurisdiction;
  if (!scope) return { id: "00000000-0000-0000-0000-000000000000" };
  if (scope.level === "STATE") return {};
  const area =
    scope.level === "DISTRICT" ? { districtId: scope.districtId! } : { mandalId: scope.mandalId! };
  return {
    OR: [
      { jurisdiction: area },
      { farmer: area },
      { provider: area },
      { operator: { provider: area } },
    ],
  };
}

async function target(caller: UserSummary, id: string) {
  const user = await database.user.findFirst({
    where: { AND: [{ id }, scopeWhere(caller)] },
    select: userFields,
  });
  if (!user) throw notFound();
  return user;
}
/** Never yourself; a department target must rank below the caller (SUPER_ADMIN may act on peers). */
function assertCanTarget(caller: UserSummary, user: Row) {
  if (user.id === caller.id)
    throw new AppError(403, "ACCESS_DENIED", "You cannot do this to your own account.");
  const roles = user.roles.map((r) => r.role.code);
  if (!caller.roles.includes("SUPER_ADMIN") && topLevel(roles) >= callerLevel(caller))
    throw new AppError(
      403,
      "ROLE_NOT_GRANTABLE",
      "You cannot manage a user of equal or higher rank.",
    );
}

export async function listUsers(caller: UserSummary, query: ListQuery) {
  const where: Prisma.UserWhereInput = {
    AND: [
      scopeWhere(caller),
      query.status ? { status: query.status } : {},
      query.role ? { roles: { some: { role: { code: query.role as RoleCode } } } } : {},
      query.districtId ? { jurisdiction: { districtId: query.districtId } } : {},
      query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: "insensitive" } },
              { displayName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    database.user.count({ where }),
    database.user.findMany({
      where,
      select: userFields,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items: rows.map(present), page: query.page, pageSize: query.pageSize, total };
}
export async function getUser(caller: UserSummary, id: string) {
  return present(await target(caller, id));
}

export async function createUser(
  caller: UserSummary,
  input: CreateUserInput,
  details: RequestDetails,
) {
  const role = input.role as RoleCode;
  if (!departmentRoles.includes(role) || roleLevel[role] > callerLevel(caller))
    throw new AppError(403, "ROLE_NOT_GRANTABLE", "You cannot grant that role.");
  const { jurisdiction } = input;
  const isAdminRole = role === "SUPER_ADMIN" || role === "STATE_ADMIN";
  const level = isAdminRole ? "STATE" : jurisdiction.level;
  if (role === "DISTRICT_OFFICER" && level !== "DISTRICT")
    throw invalid("jurisdiction.level", "District officers need DISTRICT level.");
  if (role === "MANDAL_OFFICER" && level !== "MANDAL")
    throw invalid("jurisdiction.level", "Mandal officers need MANDAL level.");
  let districtId: string | null = null;
  let mandalId: string | null = null;
  if (level !== "STATE") {
    if (!jurisdiction.districtId) throw invalid("jurisdiction.districtId", "Choose a district.");
    if (level === "MANDAL" && !jurisdiction.mandalId)
      throw invalid("jurisdiction.mandalId", "Choose a mandal.");
    districtId = jurisdiction.districtId;
    mandalId = level === "MANDAL" ? jurisdiction.mandalId! : null;
    const district = await database.district.findFirst({
      where: { id: districtId, isActive: true },
      select: { id: true },
    });
    if (!district) throw invalid("jurisdiction.districtId", "Unknown district.");
    if (mandalId) {
      const mandal = await database.mandal.findFirst({
        where: { id: mandalId, districtId, isActive: true },
        select: { id: true },
      });
      if (!mandal) throw invalid("jurisdiction.mandalId", "That mandal is not in the district.");
    }
  }
  assertInJurisdiction(caller, { districtId, mandalId });
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    return await database.$transaction(async (tx) => {
      const roleRow = await tx.role.findUnique({ where: { code: role }, select: { id: true } });
      if (!roleRow) throw new AppError(503, "ROLE_UNAVAILABLE", "That role is unavailable.");
      const user = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          mobile: input.mobile,
          passwordHash,
          mustChangePassword: true,
          createdById: caller.id,
        },
        select: { id: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
      await tx.userRoleOnboarding.create({
        data: { userId: user.id, roleId: roleRow.id, status: "COMPLETED", completedAt: new Date() },
      });
      await tx.userJurisdiction.create({ data: { userId: user.id, level, districtId, mandalId } });
      await audit(tx, details, "USER_CREATED", caller.id, {
        entityId: user.id,
        metadata: { role, level },
      });
      return present(
        await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userFields }),
      );
    });
  } catch (error) {
    const target = uniqueConstraint(error);
    if (target !== null) {
      const mobile = target.includes("mobile");
      throw new AppError(
        409,
        mobile ? "MOBILE_TAKEN" : "USERNAME_TAKEN",
        mobile ? "That mobile number is already in use." : "That username is already taken.",
        [{ field: mobile ? "mobile" : "username", message: "Already in use." }],
      );
    }
    throw error;
  }
}

type Locked = NonNullable<Awaited<ReturnType<typeof lockUser>>>;
async function mutate(
  caller: UserSummary,
  id: string,
  details: RequestDetails,
  action: string,
  change: (tx: Prisma.TransactionClient, current: Locked) => Promise<Prisma.InputJsonObject | void>,
) {
  assertCanTarget(caller, await target(caller, id));
  return database.$transaction(async (tx) => {
    const current = await lockUser(tx, id);
    if (!current) throw notFound();
    const metadata = await change(tx, current);
    await audit(tx, details, action, caller.id, { entityId: id, metadata: metadata ?? undefined });
    return present(await tx.user.findUniqueOrThrow({ where: { id }, select: userFields }));
  });
}
export const deactivateUser = (
  caller: UserSummary,
  id: string,
  reason: string,
  details: RequestDetails,
) =>
  mutate(caller, id, details, "USER_DEACTIVATED", async (tx, current) => {
    if (current.status === "INACTIVE")
      throw new AppError(409, "INVALID_STATE", "The account is already deactivated.");
    const now = new Date();
    await tx.user.update({
      where: { id },
      data: {
        status: "INACTIVE",
        deactivatedAt: now,
        deactivatedById: caller.id,
        deactivationReason: reason,
      },
    });
    await revokeSessions(tx, id, now);
    return { reason };
  });
export const reactivateUser = (caller: UserSummary, id: string, details: RequestDetails) =>
  mutate(caller, id, details, "USER_REACTIVATED", async (tx, current) => {
    if (current.status === "ACTIVE")
      throw new AppError(409, "INVALID_STATE", "The account is already active.");
    await tx.user.update({
      where: { id },
      data: {
        status: "ACTIVE",
        deactivatedAt: null,
        deactivatedById: null,
        deactivationReason: null,
      },
    });
  });
export async function resetPassword(
  caller: UserSummary,
  id: string,
  temporaryPassword: string,
  details: RequestDetails,
) {
  const passwordHash = await hashPassword(temporaryPassword);
  return mutate(caller, id, details, "PASSWORD_RESET_BY_ADMIN", async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await revokeSessions(tx, id, new Date());
  });
}
