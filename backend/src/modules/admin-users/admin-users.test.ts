import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

type Geo = Awaited<ReturnType<typeof sampleGeo>>;
let geo: Geo;
const tempPassword = "temporary passphrase 1";

beforeAll(async () => {
  geo = await sampleGeo();
});
beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const newUserBody = (overrides: Record<string, unknown> = {}) => ({
  username: uniqueName("new"),
  displayName: "New Officer",
  role: "FIELD_AGENT",
  jurisdiction: { level: "DISTRICT", districtId: geo.district.id },
  temporaryPassword: tempPassword,
  ...overrides,
});

describe("admin users: create", () => {
  it("lets a state admin create a district officer with a temporary password", async () => {
    const admin = await provisionOfficer("STATE");
    const { token } = await signIn(admin.username);
    const body = newUserBody({ role: "DISTRICT_OFFICER" });
    const created = await as(token).post("/admin/users").send(body).expect(201);
    expect(created.body.data.roles).toEqual(["DISTRICT_OFFICER"]);
    expect(created.body.data.mustChangePassword).toBe(true);
    expect(created.body.data).not.toHaveProperty("passwordHash");
    const row = await database.user.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(row.createdById).toBe(admin.id);
    expect(row.passwordHash).not.toContain(tempPassword);
    expect(
      await database.auditLog.count({ where: { actorUserId: admin.id, action: "USER_CREATED" } }),
    ).toBe(1);
  });
  it("forces STATE level for admin roles", async () => {
    const root = await provisionUser("SUPER_ADMIN", { jurisdiction: { level: "STATE" } });
    const { token } = await signIn(root.username);
    const created = await as(token)
      .post("/admin/users")
      .send(
        newUserBody({
          role: "STATE_ADMIN",
          jurisdiction: { level: "DISTRICT", districtId: geo.district.id },
        }),
      )
      .expect(201);
    expect(created.body.data.jurisdiction).toMatchObject({ level: "STATE", districtId: null });
  });
  it("stops a district officer granting a higher role or leaving their district", async () => {
    const officer = await provisionOfficer("DISTRICT", geo.district.id);
    const { token } = await signIn(officer.username);
    const higher = await as(token)
      .post("/admin/users")
      .send(newUserBody({ role: "STATE_ADMIN", jurisdiction: { level: "STATE" } }))
      .expect(403);
    expect(higher.body.code).toBe("ROLE_NOT_GRANTABLE");
    const away = await as(token)
      .post("/admin/users")
      .send(newUserBody({ jurisdiction: { level: "DISTRICT", districtId: geo.otherDistrict.id } }))
      .expect(403);
    expect(away.body.code).toBe("OUT_OF_JURISDICTION");
    await as(token).post("/admin/users").send(newUserBody()).expect(201);
  });
  it("rejects a mandal that is not in the district", async () => {
    const root = await provisionOfficer("STATE");
    const { token } = await signIn(root.username);
    const otherMandal = await database.mandal.findFirstOrThrow({
      where: { districtId: geo.otherDistrict.id },
    });
    const response = await as(token)
      .post("/admin/users")
      .send(
        newUserBody({
          role: "MANDAL_OFFICER",
          jurisdiction: { level: "MANDAL", districtId: geo.district.id, mandalId: otherMandal.id },
        }),
      )
      .expect(422);
    expect(response.body.errors[0].field).toBe("jurisdiction.mandalId");
  });
  it("reports a duplicate mobile as MOBILE_TAKEN, not USERNAME_TAKEN", async () => {
    const admin = await provisionOfficer("STATE");
    const { token } = await signIn(admin.username);
    const mobile = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    await as(token).post("/admin/users").send(newUserBody({ mobile })).expect(201);
    const clash = await as(token).post("/admin/users").send(newUserBody({ mobile })).expect(409);
    expect(clash.body.code).toBe("MOBILE_TAKEN");
    expect(clash.body.errors[0].field).toBe("mobile");
  });
  it("refuses callers without users.manage and duplicate usernames", async () => {
    const agent = await provisionOfficer("DISTRICT", geo.district.id, "FIELD_AGENT");
    const { token: agentToken } = await signIn(agent.username);
    await as(agentToken).post("/admin/users").send(newUserBody()).expect(403);
    const admin = await provisionOfficer("STATE");
    const { token } = await signIn(admin.username);
    const body = newUserBody();
    await as(token).post("/admin/users").send(body).expect(201);
    expect((await as(token).post("/admin/users").send(body).expect(409)).body.code).toBe(
      "USERNAME_TAKEN",
    );
  });
});

describe("admin users: deactivate, reactivate, reset", () => {
  async function setup() {
    const admin = await provisionOfficer("STATE");
    const target = await provisionOfficer("DISTRICT", geo.district.id, "FIELD_AGENT");
    const { token } = await signIn(admin.username);
    return { admin, target, token };
  }
  it("deactivation kills sessions immediately, blocks login and can be undone", async () => {
    const { target, token } = await setup();
    const targetSession = await signIn(target.username);
    await as(targetSession.token).get("/auth/me").expect(200);
    await as(token)
      .post(`/admin/users/${target.id}/deactivate`)
      .send({ reason: "left the department" })
      .expect(200);
    expect((await as(targetSession.token).get("/auth/me").expect(401)).body.code).toBe(
      "INVALID_SESSION",
    );
    const refused = await signIn(target.username);
    expect(refused.response.status).toBe(403);
    expect(refused.response.body.code).toBe("ACCOUNT_DEACTIVATED");
    const row = await database.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row).toMatchObject({ status: "INACTIVE", deactivationReason: "left the department" });
    await as(token)
      .post(`/admin/users/${target.id}/deactivate`)
      .send({ reason: "twice" + "xxx" })
      .expect(409);
    await as(token).post(`/admin/users/${target.id}/reactivate`).expect(200);
    expect((await signIn(target.username)).response.status).toBe(200);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: target.id } })).deactivationReason,
    ).toBeNull();
  });
  it("cannot target yourself or an equal/higher rank (unless super admin)", async () => {
    const officer = await provisionOfficer("DISTRICT", geo.district.id);
    const peer = await provisionOfficer("DISTRICT", geo.district.id);
    const { token } = await signIn(officer.username);
    await as(token)
      .post(`/admin/users/${officer.id}/deactivate`)
      .send({ reason: "myself please" })
      .expect(403);
    const peerResult = await as(token)
      .post(`/admin/users/${peer.id}/deactivate`)
      .send({ reason: "peer please" })
      .expect(403);
    expect(peerResult.body.code).toBe("ROLE_NOT_GRANTABLE");
    const root = await provisionUser("SUPER_ADMIN", { jurisdiction: { level: "STATE" } });
    const other = await provisionUser("SUPER_ADMIN", { jurisdiction: { level: "STATE" } });
    const { token: rootToken } = await signIn(root.username);
    await as(rootToken)
      .post(`/admin/users/${other.id}/deactivate`)
      .send({ reason: "super may act on peers" })
      .expect(200);
    await as(rootToken)
      .post(`/admin/users/${root.id}/deactivate`)
      .send({ reason: "not myself though" })
      .expect(403);
  });
  it("hides users outside a district officer's scope with 404", async () => {
    const officer = await provisionOfficer("DISTRICT", geo.district.id);
    const stranger = await provisionOfficer("DISTRICT", geo.otherDistrict.id, "FIELD_AGENT");
    const farmer = await provisionFarmer();
    const { token } = await signIn(officer.username);
    await as(token).get(`/admin/users/${stranger.id}`).expect(404);
    await as(token).get(`/admin/users/${farmer.id}`).expect(404);
    await as(token)
      .post(`/admin/users/${stranger.id}/deactivate`)
      .send({ reason: "not my district" })
      .expect(404);
    const list = await as(token).get("/admin/users").expect(200);
    const ids = list.body.data.items.map((u: { id: string }) => u.id);
    expect(ids).not.toContain(stranger.id);
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });
  it("resets a password to a temporary one that forces a change and revokes sessions", async () => {
    const { target, token } = await setup();
    const session = await signIn(target.username);
    await as(token)
      .post(`/admin/users/${target.id}/reset-password`)
      .send({ temporaryPassword: tempPassword })
      .expect(200);
    await as(session.token).get("/auth/me").expect(401);
    expect((await signIn(target.username)).response.status).toBe(401);
    const again = await signIn(target.username, tempPassword);
    expect(again.response.status).toBe(200);
    expect(again.response.body.data.user.mustChangePassword).toBe(true);
    expect((await as(again.token).get("/users/profile").expect(403)).body.code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
  });
  it("filters the list by status and search", async () => {
    const { target, token } = await setup();
    await as(token)
      .post(`/admin/users/${target.id}/deactivate`)
      .send({ reason: "filter check" })
      .expect(200);
    const response = await as(token)
      .get("/admin/users?status=INACTIVE&search=" + target.username)
      .expect(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].id).toBe(target.id);
    await request(app).get("/api/v1/admin/users").expect(401);
    await as(token).get("/admin/users?pageSize=500").expect(422);
  });
});

it("never mentions the password in audit metadata", async () => {
  const admin = await provisionOfficer("STATE");
  const { token } = await signIn(admin.username);
  await as(token).post("/admin/users").send(newUserBody()).expect(201);
  const rows = await database.auditLog.findMany({ where: { actorUserId: admin.id } });
  expect(JSON.stringify(rows)).not.toContain(tempPassword);
  expect(JSON.stringify(rows)).not.toContain(testPassword);
});
