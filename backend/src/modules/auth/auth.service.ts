import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { consentPurposes, policyVersion } from "../../common/constants/policies.js";
import { publicRoles } from "../rbac/roles.js";
import { hashPassword, missingAccountHash, verifyPassword } from "../../utils/password.js";
import { createRefreshToken, digest } from "../../utils/crypto.js";
import { signAccessToken } from "../../utils/jwt.js";
import { audit, getSummary, lockUser, revokeSessions } from "./auth.repository.js";
import type { AddRoleInput, LoginInput, PasswordInput, RegistrationInput } from "./auth.schema.js";
import type { RequestDetails, Session, UserSummary } from "./auth.types.js";

function invalidCredentials() {
  return new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
}
function duplicateUsername() {
  return new AppError(409, "USERNAME_TAKEN", "That username is already taken.", [
    { field: "username", message: "That username is already taken." },
  ]);
}
function invalidSession() {
  return new AppError(401, "INVALID_SESSION", "Sign in to continue.");
}

async function issueRefresh(
  tx: Prisma.TransactionClient,
  userId: string,
  familyId: string = randomUUID(),
  expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
) {
  const refreshToken = createRefreshToken();
  const row = await tx.refreshToken.create({
    data: { userId, familyId, expiresAt, tokenHash: digest(refreshToken) },
  });
  return { id: row.id, familyId, refreshToken, expiresAt };
}
function session(user: UserSummary, token: Awaited<ReturnType<typeof issueRefresh>>): Session {
  return {
    user,
    accessToken: signAccessToken(user.id, token.familyId),
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
  };
}

export async function register(input: RegistrationInput, details: RequestDetails) {
  if (await database.user.findUnique({ where: { username: input.username }, select: { id: true } }))
    throw duplicateUsername();
  const passwordHash = await hashPassword(input.password);
  try {
    return await database.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { code: input.role }, select: { id: true } });
      if (!role)
        throw new AppError(503, "ROLE_UNAVAILABLE", "Account registration is unavailable.");
      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          preferredLanguage: input.preferredLanguage,
        },
        select: { id: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.userRoleOnboarding.create({ data: { userId: user.id, roleId: role.id } });
      await tx.consent.createMany({
        data: (["TERMS_OF_USE", "PRIVACY_NOTICE"] as const).map((consentType) => ({
          userId: user.id,
          consentType,
          documentVersion: policyVersion,
          language: input.preferredLanguage,
          purposes: [...consentPurposes],
        })),
      });
      await audit(tx, details, "REGISTER", user.id, { metadata: { role: input.role } });
      return session(await getSummary(user.id, tx), await issueRefresh(tx, user.id));
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (await database.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      }))
    )
      throw duplicateUsername();
    throw error;
  }
}

export async function login(input: LoginInput, details: RequestDetails) {
  const account = await database.user.findUnique({
    where: { username: input.username },
    select: { id: true, passwordHash: true, status: true },
  });
  const valid = await verifyPassword(
    account?.passwordHash ?? (await missingAccountHash()),
    input.password,
  );
  if (!account || !valid) {
    await audit(database, details, "LOGIN_FAILED", account?.id);
    throw invalidCredentials();
  }
  if (account.status !== "ACTIVE") {
    await audit(database, details, "LOGIN_REFUSED_INACTIVE", account.id);
    throw new AppError(
      403,
      "ACCOUNT_DEACTIVATED",
      "Your account has been deactivated. Contact the department.",
    );
  }
  const result = await database.$transaction(async (tx) => {
    const current = await lockUser(tx, account.id);
    if (!current || current.status !== "ACTIVE" || current.passwordHash !== account.passwordHash) {
      await audit(tx, details, "LOGIN_FAILED", current?.id);
      return null;
    }
    await tx.user.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    await audit(tx, details, "LOGIN", account.id);
    return session(await getSummary(account.id, tx), await issueRefresh(tx, account.id));
  });
  if (!result) throw invalidCredentials();
  return result;
}

export async function refresh(token: string | undefined, details: RequestDetails) {
  if (!token) throw invalidSession();
  const tokenHash = digest(token);
  const owner = await database.refreshToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  if (!owner) throw invalidSession();
  const result = await database.$transaction(async (tx) => {
    // All session mutations lock the account before reading or changing tokens.
    const user = await lockUser(tx, owner.userId);
    if (!user || user.status !== "ACTIVE") return null;
    const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!row || row.expiresAt <= now) return null;
    if (row.replacedById) {
      await revokeSessions(tx, row.userId, now, row.familyId);
      await audit(tx, details, "REFRESH_REUSE", row.userId, {
        metadata: { familyId: row.familyId },
      });
      return { reused: true } as const;
    }
    if (row.revokedAt) return null;
    const next = await issueRefresh(tx, row.userId, row.familyId, row.expiresAt);
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: now, lastUsedAt: now, replacedById: next.id },
    });
    return session(await getSummary(row.userId, tx), next);
  });
  if (!result) throw invalidSession();
  if ("reused" in result) throw new AppError(401, "REFRESH_REUSE", "Sign in to continue.");
  return result;
}

export async function logout(token: string | undefined, details: RequestDetails) {
  if (!token) return;
  const row = await database.refreshToken.findUnique({
    where: { tokenHash: digest(token) },
    select: { userId: true, familyId: true },
  });
  if (!row) return;
  await database.$transaction(async (tx) => {
    if (!(await lockUser(tx, row.userId))) return;
    const result = await revokeSessions(tx, row.userId, new Date(), row.familyId);
    if (result.count) await audit(tx, details, "LOGOUT", row.userId);
  });
}

export async function logoutAll(userId: string, details: RequestDetails) {
  await database.$transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) throw invalidSession();
    await revokeSessions(tx, userId, new Date());
    await audit(tx, details, "LOGOUT_ALL", userId);
  });
}

export async function changePassword(
  userId: string,
  input: PasswordInput,
  details: RequestDetails,
) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw invalidSession();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await audit(database, details, "PASSWORD_CHANGE_FAILED", userId);
    throw new AppError(400, "INCORRECT_CURRENT_PASSWORD", "The current password is incorrect.");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await database.$transaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (!current || current.status !== "ACTIVE" || current.passwordHash !== user.passwordHash)
      throw invalidSession();
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await revokeSessions(tx, userId, new Date());
    await audit(tx, details, "PASSWORD_CHANGED", userId);
  });
}

export async function addRole(userId: string, input: AddRoleInput, details: RequestDetails) {
  return database.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user || user.status !== "ACTIVE") throw invalidSession();
    const held = await tx.userRole.findMany({
      where: { userId },
      select: { role: { select: { code: true } } },
    });
    const codes = held.map(({ role }) => role.code);
    if (codes.includes(input.role))
      throw new AppError(409, "ROLE_EXISTS", "You already have that role.");
    // Only self-service public accounts can add a public role; department and operator accounts cannot.
    if (!codes.length || codes.some((code) => !publicRoles.includes(code as never)))
      throw new AppError(403, "ROLE_NOT_GRANTABLE", "This account type cannot add another role.");
    const role = await tx.role.findUnique({ where: { code: input.role }, select: { id: true } });
    if (!role) throw new AppError(503, "ROLE_UNAVAILABLE", "That role is unavailable.");
    await tx.userRole.create({ data: { userId, roleId: role.id } });
    await tx.userRoleOnboarding.create({ data: { userId, roleId: role.id } });
    await audit(tx, details, "ROLE_ADDED", userId, { metadata: { role: input.role } });
    return getSummary(userId, tx);
  });
}
