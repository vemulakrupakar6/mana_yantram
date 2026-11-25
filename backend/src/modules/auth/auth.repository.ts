import type { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import type { RequestDetails, UserSummary } from "./auth.types.js";

const summaryFields = {
  id: true,
  username: true,
  displayName: true,
  preferredLanguage: true,
  mustChangePassword: true,
  jurisdiction: { select: { level: true, districtId: true, mandalId: true } },
  roles: {
    select: {
      role: {
        select: { code: true, permissions: { select: { permission: { select: { code: true } } } } },
      },
      onboarding: { select: { status: true } },
    },
  },
} satisfies Prisma.UserSelect;

export function toSummary(
  user: Prisma.UserGetPayload<{ select: typeof summaryFields }>,
): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    preferredLanguage: user.preferredLanguage === "te" ? "te" : "en",
    roles: user.roles.map(({ role }) => role.code).sort(),
    permissions: [
      ...new Set(
        user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)),
      ),
    ].sort(),
    onboarding: Object.fromEntries(
      user.roles.map(({ role, onboarding }) => [role.code, onboarding?.status ?? "NOT_STARTED"]),
    ),
    mustChangePassword: user.mustChangePassword,
    jurisdiction: user.jurisdiction,
  };
}
export async function getSummary(id: string, client: Prisma.TransactionClient = database) {
  const user = await client.user.findUnique({ where: { id }, select: summaryFields });
  if (!user) throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
  return toSummary(user);
}
export async function authenticatedUser(userId: string, familyId: string) {
  const user = await database.user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      refreshTokens: { some: { familyId, revokedAt: null, expiresAt: { gt: new Date() } } },
    },
    select: summaryFields,
  });
  return user ? toSummary(user) : null;
}
export async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.user.findUnique({
    where: { id },
    select: { id: true, status: true, passwordHash: true },
  });
}
export function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  familyId?: string,
) {
  return tx.refreshToken.updateMany({
    where: { userId, familyId, revokedAt: null },
    data: { revokedAt: now },
  });
}
export interface AuditOptions {
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
}
export function audit(
  client: Prisma.TransactionClient,
  details: RequestDetails,
  action: string,
  actorId?: string,
  { entityType = "user", entityId = actorId, metadata }: AuditOptions = {},
) {
  return client.auditLog.create({
    data: {
      actorUserId: actorId,
      action,
      entityType,
      entityId,
      metadata,
      requestId: details.requestId,
      ipAddress: details.ipAddress,
    },
  });
}
