import { randomUUID } from "node:crypto";
import type { JurisdictionLevel, RoleCode } from "@prisma/client";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/config/database.js";
import { removeStored } from "../src/modules/files/files.storage.js";
import { hashPassword } from "../src/utils/password.js";

export const testPassword = "correct horse battery staple";
const prefix = "t3_" + randomUUID().slice(0, 8) + "_";
export const uniqueName = (label = "u") => prefix + label + randomUUID().slice(0, 6);
let hash: Promise<string> | undefined;
const passwordHash = () => (hash ??= hashPassword(testPassword));

/** Cleanup everything created through these factories. Call from afterAll. */
export async function cleanupFactories() {
  const users = await database.user.findMany({
    where: { username: { startsWith: prefix } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Foreign keys from provider data to users are RESTRICT, so remove provider-owned data first.
  await database.providerVerification.deleteMany({ where: { actorId: { in: ids } } });
  await database.operator.deleteMany({ where: { userId: { in: ids } } });
  await database.provider.deleteMany({ where: { userId: { in: ids } } });
  const files = await database.storedFile.findMany({
    where: { ownerUserId: { in: ids } },
    select: { relPath: true },
  });
  for (const file of files) await removeStored(file.relPath);
  await database.storedFile.deleteMany({ where: { ownerUserId: { in: ids } } });
  await database.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
  await database.user.deleteMany({ where: { id: { in: ids } } });
}
export async function sampleGeo() {
  const district = await database.district.findFirstOrThrow({
    where: { lgdCode: "T001" },
    include: { mandals: { orderBy: { lgdCode: "asc" }, include: { villages: true } } },
  });
  const other = await database.district.findFirstOrThrow({ where: { lgdCode: "T002" } });
  return { district, otherDistrict: other, mandal: district.mandals[0] };
}
export async function provisionUser(
  role: RoleCode,
  options: {
    status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    mustChangePassword?: boolean;
    jurisdiction?: { level: JurisdictionLevel; districtId?: string; mandalId?: string };
    mobile?: string;
  } = {},
) {
  const membership = await database.role.findUniqueOrThrow({ where: { code: role } });
  const user = await database.user.create({
    data: {
      username: uniqueName(role.toLowerCase().slice(0, 4)),
      passwordHash: await passwordHash(),
      status: options.status ?? "ACTIVE",
      mustChangePassword: options.mustChangePassword ?? false,
      mobile: options.mobile,
      roles: { create: { roleId: membership.id } },
      onboarding: { create: { roleId: membership.id } },
      jurisdiction: options.jurisdiction ? { create: options.jurisdiction } : undefined,
    },
  });
  return user;
}
export const provisionFarmer = (options = {}) => provisionUser("FARMER", options);
export const provisionProvider = (options = {}) => provisionUser("PROVIDER", options);
export function provisionOfficer(
  level: JurisdictionLevel,
  districtId?: string,
  role: RoleCode = level === "STATE"
    ? "STATE_ADMIN"
    : level === "DISTRICT"
      ? "DISTRICT_OFFICER"
      : "MANDAL_OFFICER",
  mandalId?: string,
) {
  return provisionUser(role, { jurisdiction: { level, districtId, mandalId } });
}
export async function signIn(username: string, password = testPassword) {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("X-CSRF-Protection", "1")
    .send({ username, password });
  return { response, token: response.body?.data?.accessToken as string };
}
export const bearer = (token: string) => "Bearer " + token;
/** Authenticated request helper: bearer token + CSRF header for write requests. */
export function as(token: string) {
  return {
    get: (path: string) =>
      request(app)
        .get("/api/v1" + path)
        .set("Authorization", bearer(token)),
    post: (path: string) =>
      request(app)
        .post("/api/v1" + path)
        .set("Authorization", bearer(token))
        .set("X-CSRF-Protection", "1"),
    put: (path: string) =>
      request(app)
        .put("/api/v1" + path)
        .set("Authorization", bearer(token))
        .set("X-CSRF-Protection", "1"),
    patch: (path: string) =>
      request(app)
        .patch("/api/v1" + path)
        .set("Authorization", bearer(token))
        .set("X-CSRF-Protection", "1"),
    delete: (path: string) =>
      request(app)
        .delete("/api/v1" + path)
        .set("Authorization", bearer(token))
        .set("X-CSRF-Protection", "1"),
  };
}
export async function clearLoginLimits() {
  await database.authRateLimit.deleteMany({});
}
