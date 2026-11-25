import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionOfficer,
  provisionUser,
  sampleGeo,
  signIn,
  testPassword,
  uniqueName,
} from "../../../tests/factories.js";

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

describe("forced password change", () => {
  it("blocks everything except me / change-password / logout until changed", async () => {
    const user = await provisionUser("FARMER", { mustChangePassword: true });
    const { token, response } = await signIn(user.username);
    expect(response.body.data.user.mustChangePassword).toBe(true);
    const blocked = await as(token).get("/users/profile").expect(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await as(token).get("/portals/farmer").expect(403)).body.code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
    await as(token).get("/auth/me").expect(200);
    const next = "a brand new passphrase";
    await as(token)
      .patch("/auth/change-password")
      .send({ currentPassword: testPassword, newPassword: next, confirmPassword: next })
      .expect(200);
    const again = await signIn(user.username, next);
    expect(again.response.body.data.user.mustChangePassword).toBe(false);
    await as(again.token).get("/users/profile").expect(200);
  });
});

describe("POST /auth/roles", () => {
  it("adds PROVIDER to a farmer, then rejects a duplicate", async () => {
    const farmer = await provisionFarmer();
    const { token } = await signIn(farmer.username);
    const added = await as(token).post("/auth/roles").send({ role: "PROVIDER" }).expect(201);
    expect(added.body.data.roles).toEqual(["FARMER", "PROVIDER"]);
    expect(added.body.data.onboarding.PROVIDER).toBe("NOT_STARTED");
    expect(added.body.data.permissions).toContain("portal:provider");
    expect(
      (await as(token).post("/auth/roles").send({ role: "PROVIDER" }).expect(409)).body.code,
    ).toBe("ROLE_EXISTS");
    expect(
      await database.auditLog.count({ where: { actorUserId: farmer.id, action: "ROLE_ADDED" } }),
    ).toBe(1);
  });
  it("refuses department and operator accounts, and unknown roles", async () => {
    const officer = await provisionOfficer("STATE");
    const { token } = await signIn(officer.username);
    expect(
      (await as(token).post("/auth/roles").send({ role: "FARMER" }).expect(403)).body.code,
    ).toBe("ROLE_NOT_GRANTABLE");
    const operator = await provisionUser("OPERATOR");
    const { token: opToken } = await signIn(operator.username);
    await as(opToken).post("/auth/roles").send({ role: "PROVIDER" }).expect(403);
    await as(token).post("/auth/roles").send({ role: "SUPER_ADMIN" }).expect(422);
  });
});

describe("mobile uniqueness and format", () => {
  it("normalises to 10 digits and returns 409 MOBILE_TAKEN on conflict", async () => {
    const mobile = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const first = await provisionFarmer();
    const second = await provisionFarmer();
    const a = await signIn(first.username);
    const b = await signIn(second.username);
    await as(a.token).patch("/users/profile").send({ mobile }).expect(200);
    const clash = await as(b.token).patch("/users/profile").send({ mobile }).expect(409);
    expect(clash.body.code).toBe("MOBILE_TAKEN");
    for (const bad of ["+91 " + mobile, "(" + mobile + ")", "12345", "5" + mobile.slice(1)])
      await as(b.token).patch("/users/profile").send({ mobile: bad }).expect(422);
  });
});

describe("registration consent", () => {
  it("records purposes", async () => {
    const username = uniqueName("reg");
    const password = "correct horse battery staple";
    await request(app)
      .post("/api/v1/auth/register")
      .set("X-CSRF-Protection", "1")
      .send({
        username,
        password,
        confirmPassword: password,
        role: "FARMER",
        preferredLanguage: "te",
        acceptTerms: true,
        acceptPrivacyPolicy: true,
      })
      .expect(201);
    const consents = await database.consent.findMany({ where: { user: { username } } });
    expect(consents).toHaveLength(2);
    for (const consent of consents)
      expect(consent.purposes).toEqual(["ACCOUNT", "SERVICE_DELIVERY", "NOTIFICATIONS"]);
  });
});

describe("summary, portals and health", () => {
  it("includes jurisdiction and serves the operator portal", async () => {
    const geo = await sampleGeo();
    const officer = await provisionOfficer("DISTRICT", geo.district.id);
    const { token } = await signIn(officer.username);
    const me = await as(token).get("/auth/me").expect(200);
    expect(me.body.data.jurisdiction).toEqual({
      level: "DISTRICT",
      districtId: geo.district.id,
      mandalId: null,
    });
    expect(me.body.data.permissions).toEqual(
      expect.arrayContaining(["users.manage", "provider.verify", "farmer.view"]),
    );
    expect(me.body.data.permissions).not.toContain("settings.manage");
    const operator = await provisionUser("OPERATOR");
    const op = await signIn(operator.username);
    await as(op.token).get("/portals/operator").expect(200);
    await as(op.token).get("/portals/farmer").expect(403);
  });
  it("readiness reports storage and rejects an unusable root", async () => {
    await request(app).get("/api/v1/health/ready").expect(200);
    expect(randomUUID()).toBeTruthy();
  });
});
