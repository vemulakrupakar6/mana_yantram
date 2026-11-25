import { randomUUID } from "node:crypto";
import type { RoleCode, AccountStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app.js";
import { database } from "../../config/database.js";
import { env } from "../../config/env.js";
import { hashPassword } from "../../utils/password.js";
import { digest } from "../../utils/crypto.js";
import { cleanExpiredRateLimits } from "../../middleware/rate-limit.js";

const api = "/api/v1";
const auth = api + "/auth";
const prefix = "test_" + randomUUID().slice(0, 8) + "_";
const newUsername = () => prefix + randomUUID().slice(0, 8);
const password = "correct horse battery staple";
const nextPassword = "another strong passphrase";
const write = (path: string) =>
  request(app)
    .post(auth + path)
    .set("X-CSRF-Protection", "1");
const register = (override: Record<string, unknown> = {}) =>
  write("/register").send({
    username: newUsername(),
    password,
    confirmPassword: password,
    role: "FARMER",
    preferredLanguage: "en",
    acceptTerms: true,
    acceptPrivacyPolicy: true,
    ...override,
  });
const login = (username: string, secret = password) =>
  write("/login").send({ username, password: secret });
const bearer = (accessToken: string) => "Bearer " + accessToken;
const cookie = (response: Response) =>
  (response.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
const token = (value: string) => value.split("=")[1];
const refresh = (value: string) => write("/refresh").set("Cookie", value);
const me = (accessToken: string) =>
  request(app)
    .get(auth + "/me")
    .set("Authorization", bearer(accessToken));
const change = (accessToken: string, currentPassword = password, newPassword = nextPassword) =>
  request(app)
    .patch(auth + "/change-password")
    .set("X-CSRF-Protection", "1")
    .set("Authorization", bearer(accessToken))
    .send({ currentPassword, newPassword, confirmPassword: newPassword });

let hash: string;
async function provision(role: RoleCode = "FARMER", status: AccountStatus = "ACTIVE") {
  const membership = await database.role.findUniqueOrThrow({ where: { code: role } });
  return database.user.create({
    data: {
      username: newUsername(),
      passwordHash: hash,
      status,
      roles: { create: { roleId: membership.id } },
    },
  });
}
async function signIn(role?: RoleCode) {
  const user = await provision(role);
  return { user, response: await login(user.username).expect(200) };
}
const limitOperations = ["register", "login", "refresh", "password"];
const ipKeys = limitOperations.flatMap((operation) =>
  ["::ffff:127.0.0.1", "127.0.0.1", "::1"].map((ip) => digest(operation + ":ip:" + ip)),
);

beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(async () => {
  await database.authRateLimit.deleteMany({ where: { key: { in: ipKeys } } });
});
afterAll(async () => {
  await database.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await database.authRateLimit.deleteMany({ where: { key: { in: ipKeys } } });
  await database.$disconnect();
});

describe("registration", () => {
  it.each(["FARMER", "PROVIDER"] as const)(
    "registers a %s with consent, audit and a real session",
    async (role) => {
      const response = await register({ role, preferredLanguage: "te" }).expect(201);
      const summary = response.body.data.user;
      expect(summary.roles).toEqual([role]);
      expect(summary.onboarding).toEqual({ [role]: "NOT_STARTED" });
      expect(summary.preferredLanguage).toBe("te");
      expect(response.body.data).not.toHaveProperty("refreshToken");
      expect(summary).not.toHaveProperty("passwordHash");
      expect(response.headers["set-cookie"][0]).toMatch(
        /Path=\/api\/v1\/auth.*HttpOnly.*SameSite=Lax/,
      );
      const user = await database.user.findUniqueOrThrow({
        where: { id: summary.id },
        include: { consents: true, audits: true, refreshTokens: true },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(
        user.consents.map((consent) => [
          consent.consentType,
          consent.documentVersion,
          consent.language,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["TERMS_OF_USE", "demo-1.0", "te"],
          ["PRIVACY_NOTICE", "demo-1.0", "te"],
        ]),
      );
      expect(user.audits.map(({ action }) => action)).toEqual(["REGISTER"]);
      expect(user.refreshTokens[0].tokenHash).toBe(digest(token(cookie(response))));
      await me(response.body.data.accessToken).expect(200);
    },
  );
  it("rejects duplicate usernames", async () => {
    const username = newUsername();
    await register({ username }).expect(201);
    const response = await register({ username }).expect(409);
    expect(response.body.code).toBe("USERNAME_TAKEN");
  });
  it("normalizes username case before persistence and uniqueness", async () => {
    const username = newUsername();
    const response = await register({ username: username.toUpperCase() }).expect(201);
    expect(response.body.data.user.username).toBe(username);
    await register({ username }).expect(409);
  });
  it("returns only one successful registration for concurrent duplicate requests", async () => {
    const username = newUsername();
    const responses = await Promise.all([register({ username }), register({ username })]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  });
  it.each([
    ["administrator self-registration", { role: "SUPER_ADMIN" }],
    ["operator self-registration", { role: "OPERATOR" }],
    ["missing terms consent", { acceptTerms: undefined }],
    ["missing privacy consent", { acceptPrivacyPolicy: false }],
    ["invalid password", { password: "short", confirmPassword: "short" }],
    ["confirmation mismatch", { confirmPassword: "incorrect confirmation" }],
    ["unrecognized fields", { status: "ACTIVE" }],
  ])("rejects %s", async (_name, input) => {
    const response = await register(input).expect(422);
    expect(response.body).toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
      requestId: expect.any(String),
    });
  });
  it("rejects invalid browser origins and missing CSRF headers", async () => {
    await write("/login")
      .set("Origin", "https://example.invalid")
      .send({ username: newUsername(), password })
      .expect(403);
    await request(app)
      .post(auth + "/refresh")
      .expect(403);
  });
});

describe("sign in and access tokens", () => {
  it("signs in with a normalized username and records the time and audit", async () => {
    const user = await provision();
    const response = await login(user.username.toUpperCase()).expect(200);
    expect(response.body.data.user).toMatchObject({
      username: user.username,
      roles: ["FARMER"],
      permissions: ["portal:farmer"],
    });
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt,
    ).toBeInstanceOf(Date);
    expect(
      await database.auditLog.count({ where: { actorUserId: user.id, action: "LOGIN" } }),
    ).toBe(1);
  });
  it("uses the same response for an incorrect password and an unknown username", async () => {
    const user = await provision();
    const wrong = await login(user.username, "wrong").expect(401);
    const unknown = await login(newUsername()).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
    expect(
      await database.auditLog.count({ where: { actorUserId: user.id, action: "LOGIN_FAILED" } }),
    ).toBe(1);
  });
  it.each(["INACTIVE", "SUSPENDED"] as const)(
    "refuses %s accounts with ACCOUNT_DEACTIVATED only for the right password",
    async (status) => {
      const user = await provision("FARMER", status);
      const response = await login(user.username).expect(403);
      expect(response.body.code).toBe("ACCOUNT_DEACTIVATED");
      const wrong = await login(user.username, "definitely wrong password").expect(401);
      expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
    },
  );
  it("rate limits repeated username and IP pairs", async () => {
    const username = newUsername();
    for (let count = 0; count < 5; count++) await login(username, "wrong").expect(401);
    const response = await login(username.toUpperCase(), "wrong").expect(429);
    expect(response.body.code).toBe("RATE_LIMITED");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  });
  it("cleans up expired rate limit entries", async () => {
    const key = digest(newUsername());
    await database.authRateLimit.create({ data: { key, expiresAt: new Date(0) } });
    await cleanExpiredRateLimits();
    expect(await database.authRateLimit.findUnique({ where: { key } })).toBeNull();
  });
  it("rejects requests without a token", async () => {
    await request(app)
      .get(auth + "/me")
      .expect(401);
  });
  it("rejects invalid tokens", async () => {
    expect((await me("not-a-jwt").expect(401)).body.code).toBe("INVALID_TOKEN");
  });
  it("reports token expiry", async () => {
    const expired = jwt.sign({ sid: randomUUID() }, env.JWT_ACCESS_SECRET, {
      subject: randomUUID(),
      issuer: "mana-yantram",
      audience: "mana-yantram-api",
      expiresIn: -1,
    });
    expect((await me(expired).expect(401)).body.code).toBe("TOKEN_EXPIRED");
  });
  it("checks current account status after login", async () => {
    const { user, response } = await signIn();
    await database.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await me(response.body.data.accessToken).expect(401);
    await refresh(cookie(response)).expect(401);
  });
});

describe("session rotation and revocation", () => {
  it("rotates refresh cookies and preserves the original expiry", async () => {
    const { response } = await signIn();
    const previous = cookie(response);
    const result = await refresh(previous).expect(200);
    const latest = cookie(result);
    expect(latest).not.toBe(previous);
    const old = await database.refreshToken.findUniqueOrThrow({
      where: { tokenHash: digest(token(previous)) },
      include: { replacedBy: true },
    });
    expect(old.revokedAt).toBeInstanceOf(Date);
    expect(old.lastUsedAt).toBeInstanceOf(Date);
    expect(old.replacedBy).toMatchObject({
      familyId: old.familyId,
      expiresAt: old.expiresAt,
      tokenHash: digest(token(latest)),
    });
    await me(result.body.data.accessToken).expect(200);
  });
  it("rejects expired refresh tokens", async () => {
    const { response } = await signIn();
    await database.refreshToken.update({
      where: { tokenHash: digest(token(cookie(response))) },
      data: { expiresAt: new Date(0) },
    });
    await refresh(cookie(response)).expect(401);
  });
  it("rejects revoked refresh tokens", async () => {
    const { response } = await signIn();
    await database.refreshToken.update({
      where: { tokenHash: digest(token(cookie(response))) },
      data: { revokedAt: new Date() },
    });
    await refresh(cookie(response)).expect(401);
  });
  it("detects token reuse and revokes only the affected family", async () => {
    const { response, user } = await signIn();
    const anotherSession = await login(user.username).expect(200);
    const rotation = await refresh(cookie(response)).expect(200);
    const reuse = await refresh(cookie(response)).expect(401);
    expect(reuse.body.code).toBe("REFRESH_REUSE");
    await refresh(cookie(rotation)).expect(401);
    await me(rotation.body.data.accessToken).expect(401);
    await refresh(cookie(anotherSession)).expect(200);
    expect(
      await database.auditLog.count({ where: { actorUserId: user.id, action: "REFRESH_REUSE" } }),
    ).toBe(1);
  });
  it("serializes concurrent reuse without leaving an active session", async () => {
    const { response, user } = await signIn();
    const results = await Promise.all([refresh(cookie(response)), refresh(cookie(response))]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(await database.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
  });
  it("logs out, clears the refresh cookie and immediately invalidates session tokens", async () => {
    const { response, user } = await signIn();
    const result = await write("/logout").set("Cookie", cookie(response)).expect(200);
    expect(cookie(result)).toBe("mana_refresh=");
    await refresh(cookie(response)).expect(401);
    await me(response.body.data.accessToken).expect(401);
    expect(
      await database.auditLog.count({ where: { actorUserId: user.id, action: "LOGOUT" } }),
    ).toBe(1);
  });
  it("logs out all sessions including an independently issued session", async () => {
    const { response, user } = await signIn();
    const other = await login(user.username).expect(200);
    await write("/logout-all")
      .set("Authorization", bearer(response.body.data.accessToken))
      .expect(200);
    await refresh(cookie(response)).expect(401);
    await refresh(cookie(other)).expect(401);
    await me(other.body.data.accessToken).expect(401);
  });
});

describe("authorization and account details", () => {
  const portal = (path: string, accessToken: string) =>
    request(app)
      .get(api + "/portals/" + path)
      .set("Authorization", bearer(accessToken));
  it.each(["FARMER", "PROVIDER"] as const)(
    "%s cannot access the department portal or the other marketplace portal",
    async (role) => {
      const { response } = await signIn(role);
      const token = response.body.data.accessToken;
      await portal("admin", token).expect(403);
      await portal(role === "FARMER" ? "provider" : "farmer", token).expect(403);
      await portal(role.toLowerCase(), token).expect(200);
    },
  );
  it("allows a department officer with the required permission", async () => {
    const { response } = await signIn("DISTRICT_OFFICER");
    await portal("admin", response.body.data.accessToken).expect(200);
  });
  it("enforces current role membership and permission on issued tokens", async () => {
    const { response, user } = await signIn("DISTRICT_OFFICER");
    await database.userRole.deleteMany({ where: { userId: user.id } });
    await portal("admin", response.body.data.accessToken).expect(403);
  });
  it("returns separate onboarding status for multiple roles", async () => {
    const user = await provision();
    const farmer = await database.role.findUniqueOrThrow({ where: { code: "FARMER" } });
    const provider = await database.role.findUniqueOrThrow({ where: { code: "PROVIDER" } });
    await database.userRole.create({ data: { userId: user.id, roleId: provider.id } });
    await database.userRoleOnboarding.create({
      data: { userId: user.id, roleId: farmer.id, status: "COMPLETED", completedAt: new Date() },
    });
    const response = await login(user.username).expect(200);
    expect(response.body.data.user).toMatchObject({
      roles: ["FARMER", "PROVIDER"],
      onboarding: { FARMER: "COMPLETED", PROVIDER: "NOT_STARTED" },
    });
  });
  it("edits only account fields and returns fresh profile details", async () => {
    const { response, user } = await signIn();
    const url = api + "/users/profile";
    const authorization = bearer(response.body.data.accessToken);
    const patch = await request(app)
      .patch(url)
      .set("Authorization", authorization)
      .send({
        displayName: "Test Farmer",
        preferredLanguage: "te",
        email: "test@example.invalid",
        mobile: "9876543210",
      })
      .expect(200);
    expect(patch.body.data).toMatchObject({
      displayName: "Test Farmer",
      preferredLanguage: "te",
      emailVerified: false,
      mobileVerified: false,
    });
    const latest = await request(app).get(url).set("Authorization", authorization).expect(200);
    expect(latest.body.data).toMatchObject({
      id: user.id,
      username: user.username,
      roles: ["FARMER"],
      displayName: "Test Farmer",
    });
    expect(latest.body.data).not.toHaveProperty("passwordHash");
  });
  it("rejects role, status and verification updates", async () => {
    const { response } = await signIn();
    const result = await request(app)
      .patch(api + "/users/profile")
      .set("Authorization", bearer(response.body.data.accessToken))
      .send({ roles: ["SUPER_ADMIN"], status: "ACTIVE", emailVerified: true })
      .expect(422);
    expect(result.body.errors.map(({ field }: { field: string }) => field)).toEqual([
      "roles",
      "status",
      "emailVerified",
    ]);
  });
  it("changes the password, revokes all sessions and requires sign-in", async () => {
    const { response, user } = await signIn();
    const other = await login(user.username).expect(200);
    await change(response.body.data.accessToken).expect(200);
    await refresh(cookie(response)).expect(401);
    await refresh(cookie(other)).expect(401);
    await me(other.body.data.accessToken).expect(401);
    await login(user.username).expect(401);
    await login(user.username, nextPassword).expect(200);
    expect(
      await database.auditLog.count({
        where: { actorUserId: user.id, action: "PASSWORD_CHANGED" },
      }),
    ).toBe(1);
  });
  it("rejects incorrect current passwords", async () => {
    const { response } = await signIn();
    const result = await change(response.body.data.accessToken, "incorrect").expect(400);
    expect(result.body.code).toBe("INCORRECT_CURRENT_PASSWORD");
    await me(response.body.data.accessToken).expect(200);
  });
  it("rejects reuse of the current password", async () => {
    const { response } = await signIn();
    await change(response.body.data.accessToken, password, password).expect(422);
  });
});

describe("health", () => {
  it("answers liveness and checks the dedicated PostgreSQL database", async () => {
    await request(app)
      .get(api + "/health")
      .expect(200);
    const response = await request(app)
      .get(api + "/health/ready")
      .expect(200);
    expect(response.body.data.status).toBe("ready");
  });
  it("returns 503 when the readiness query fails", async () => {
    const query = vi.spyOn(database, "$queryRaw").mockRejectedValueOnce(new Error("unavailable"));
    try {
      await request(app)
        .get(api + "/health/ready")
        .expect(503);
    } finally {
      query.mockRestore();
    }
  });
});
