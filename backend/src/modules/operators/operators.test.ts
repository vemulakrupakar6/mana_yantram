import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionOfficer,
  provisionFarmer,
  signIn,
  testPassword,
  uniqueName,
} from "../../../tests/factories.js";
import {
  addEquipment,
  mobile,
  png,
  providerSession,
  setStatus,
} from "../../../tests/provider-setup.js";

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const temp = "temporary passphrase 1";
const body = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Venkat Operator",
  mobile: mobile(),
  username: uniqueName("op"),
  temporaryPassword: temp,
  ...overrides,
});
const create = (token: string, overrides: Record<string, unknown> = {}) =>
  as(token).post("/providers/me/operators").send(body(overrides));
const licence = async (token: string) =>
  (
    await as(token)
      .post("/files")
      .field("purpose", "DOCUMENT")
      .attach("file", png, "licence.png")
      .expect(201)
  ).body.data.id as string;

describe("operator creation", () => {
  it("creates the account, role, onboarding, licence and assignments in one go", async () => {
    const s = await providerSession();
    const eq = await addEquipment(s.id);
    const licenceFileId = await licence(s.token);
    const input = body({ licenceNo: "DL-123456", licenceFileId, equipmentIds: [eq.id] });
    const created = await as(s.token).post("/providers/me/operators").send(input).expect(201);
    expect(created.body.data).toMatchObject({
      fullName: "Venkat Operator",
      username: input.username,
      mobile: input.mobile,
      status: "ACTIVE",
      mustChangePassword: true,
      licenceNo: "DL-123456",
      licenceFile: { id: licenceFileId },
      equipment: [{ id: eq.id }],
    });
    expect(JSON.stringify(created.body)).not.toContain(temp);
    const user = await database.user.findUniqueOrThrow({
      where: { username: input.username },
      include: { roles: { include: { role: true } }, onboarding: true },
    });
    expect(user.createdById).toBe(s.user.id);
    expect(user.roles.map((r) => r.role.code)).toEqual(["OPERATOR"]);
    expect(user.onboarding[0].status).toBe("COMPLETED");
    const file = await database.storedFile.findUniqueOrThrow({ where: { id: licenceFileId } });
    expect(file).toMatchObject({ entityType: "operator", entityId: created.body.data.id });
    expect(file.attachedAt).not.toBeNull();
    const audits = await database.auditLog.findMany({ where: { actorUserId: s.user.id } });
    expect(JSON.stringify(audits)).not.toContain(temp);
    expect((await as(s.token).get("/providers/me").expect(200)).body.data.counts.operators).toBe(1);
  });
  it("reports duplicate usernames and mobiles, and rolls back completely", async () => {
    const s = await providerSession();
    const first = body();
    await as(s.token).post("/providers/me/operators").send(first).expect(201);
    const sameName = await create(s.token, { username: first.username }).expect(409);
    expect(sameName.body.code).toBe("USERNAME_TAKEN");
    const sameMobile = await create(s.token, { mobile: first.mobile }).expect(409);
    expect(sameMobile.body.code).toBe("MOBILE_TAKEN");
    const orphan = body();
    const file = await licence(s.token);
    await create(s.token, {
      ...orphan,
      licenceFileId: file,
      equipmentIds: ["0b0c0d0e-0000-4000-8000-000000000000"],
    }).expect(422);
    expect(await database.user.count({ where: { username: orphan.username } })).toBe(0);
    expect(
      (await database.storedFile.findUniqueOrThrow({ where: { id: file } })).attachedAt,
    ).toBeNull();
  });
  it("validates input, equipment ownership and files", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const foreign = await addEquipment(b.id);
    for (const bad of [
      { fullName: "x" },
      { mobile: "12345" },
      { username: "AB" },
      { temporaryPassword: "short" },
      { licenceNo: "ab" },
      { equipmentIds: ["nope"] },
      { extra: 1 },
    ])
      await create(a.token, bad).expect(422);
    const stolen = await create(a.token, { equipmentIds: [foreign.id] }).expect(422);
    expect(stolen.body.errors[0].field).toBe("equipmentIds");
    const theirFile = await licence(b.token);
    expect((await create(a.token, { licenceFileId: theirFile }).expect(422)).body.code).toBe(
      "FILE_NOT_AVAILABLE",
    );
  });
  it("needs the provider role and a profile", async () => {
    const farmer = await provisionFarmer();
    await as((await signIn(farmer.username)).token)
      .post("/providers/me/operators")
      .send(body())
      .expect(403);
  });
});

describe("operator login and self view", () => {
  async function operator() {
    const s = await providerSession();
    const eq = await addEquipment(s.id, "TRACTOR", 2);
    const input = body({ licenceNo: "DL-999999", equipmentIds: [eq.id] });
    const made = (await as(s.token).post("/providers/me/operators").send(input).expect(201)).body
      .data;
    return { ...s, eq, input, operatorId: made.id as string };
  }
  it("forces a password change, then serves /operator/me with the assigned equipment", async () => {
    const o = await operator();
    const login = await signIn(o.input.username, temp);
    expect(login.response.status).toBe(200);
    expect(login.response.body.data.user.roles).toEqual(["OPERATOR"]);
    expect((await as(login.token).get("/operator/me").expect(403)).body.code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
    const next = "my own operator passphrase";
    await as(login.token)
      .patch("/auth/change-password")
      .send({ currentPassword: temp, newPassword: next, confirmPassword: next })
      .expect(200);
    const again = await signIn(o.input.username, next);
    const me = await as(again.token).get("/operator/me").expect(200);
    expect(me.body.data).toMatchObject({
      fullName: "Venkat Operator",
      licenceNo: "DL-999999",
      provider: { name: "Sri Rama Agro", status: "DRAFT" },
    });
    expect(me.body.data.provider.providerNo).toMatch(/^PRV/);
    expect(me.body.data.equipment).toHaveLength(1);
    expect(me.body.data.equipment[0]).toMatchObject({
      id: o.eq.id,
      make: "Mahindra",
      category: { code: "TRACTOR" },
    });
    expect(me.body.data.equipment[0].units.map((u: { unitLabel: string }) => u.unitLabel)).toEqual([
      "Unit 1",
      "Unit 2",
    ]);
    await as(again.token).get("/portals/operator").expect(200);
  });
  it("cannot reach provider, farmer or admin endpoints", async () => {
    const o = await operator();
    const next = "my own operator passphrase";
    const first = await signIn(o.input.username, temp);
    await as(first.token)
      .patch("/auth/change-password")
      .send({ currentPassword: temp, newPassword: next, confirmPassword: next })
      .expect(200);
    const { token } = await signIn(o.input.username, next);
    for (const path of [
      "/providers/me",
      "/providers/me/operators",
      "/providers/me/equipment",
      "/farmers/me",
      "/admin/users",
      "/admin/farmers",
    ])
      await as(token).get(path).expect(403);
    const anonymous = await as("x").get("/operator/me");
    expect(anonymous.status).toBe(401);
    const farmer = await provisionFarmer();
    await as((await signIn(farmer.username)).token)
      .get("/operator/me")
      .expect(403);
  });
});

describe("managing operators", () => {
  async function setup() {
    const s = await providerSession();
    const eq = await addEquipment(s.id);
    const input = body({ equipmentIds: [eq.id] });
    const made = (await as(s.token).post("/providers/me/operators").send(input).expect(201)).body
      .data;
    return {
      ...s,
      eq,
      input,
      operatorId: made.id as string,
      url: "/providers/me/operators/" + made.id,
    };
  }
  it("lists, reads and updates (name, mobile, licence replaced with the old file soft-deleted)", async () => {
    const s = await setup();
    const list = (await as(s.token).get("/providers/me/operators").expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ username: s.input.username, equipment: [{ id: s.eq.id }] });
    const first = await licence(s.token);
    const newMobile = mobile();
    await as(s.token)
      .patch(s.url)
      .send({
        fullName: "Renamed",
        mobile: newMobile,
        licenceNo: "DL-111111",
        licenceFileId: first,
      })
      .expect(200);
    const second = await licence(s.token);
    const updated = await as(s.token).patch(s.url).send({ licenceFileId: second }).expect(200);
    expect(updated.body.data).toMatchObject({
      fullName: "Renamed",
      mobile: newMobile,
      licenceFile: { id: second },
    });
    expect(
      (await database.storedFile.findUniqueOrThrow({ where: { id: first } })).deletedAt,
    ).not.toBeNull();
    expect(
      (await database.user.findUniqueOrThrow({ where: { username: s.input.username } }))
        .displayName,
    ).toBe("Renamed");
    const cleared = await as(s.token)
      .patch(s.url)
      .send({ licenceFileId: null, licenceNo: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ licenceFile: null, licenceNo: null });
    await as(s.token).patch(s.url).send({}).expect(422);
    await as(s.token).patch(s.url).send({ username: "hack" }).expect(422);
    const other = body();
    await as(s.token).post("/providers/me/operators").send(other).expect(201);
    expect(
      (await as(s.token).patch(s.url).send({ mobile: other.mobile }).expect(409)).body.code,
    ).toBe("MOBILE_TAKEN");
  });
  it("replaces the assigned equipment set, only with the provider's own equipment", async () => {
    const s = await setup();
    const second = await addEquipment(s.id);
    const foreign = await addEquipment((await providerSession()).id);
    const set = await as(s.token)
      .put(s.url + "/equipment")
      .send({ equipmentIds: [second.id] })
      .expect(200);
    expect(set.body.data.equipment.map((e: { id: string }) => e.id)).toEqual([second.id]);
    await as(s.token)
      .put(s.url + "/equipment")
      .send({ equipmentIds: [foreign.id] })
      .expect(422);
    expect(
      (
        await as(s.token)
          .put(s.url + "/equipment")
          .send({ equipmentIds: [] })
          .expect(200)
      ).body.data.equipment,
    ).toEqual([]);
  });
  it("deactivation blocks login and kills sessions; activation restores access", async () => {
    const s = await setup();
    const login = await signIn(s.input.username, temp);
    await as(login.token).get("/auth/me").expect(200);
    await as(s.token)
      .post(s.url + "/deactivate")
      .expect(200);
    await as(login.token).get("/auth/me").expect(401);
    const refused = await signIn(s.input.username, temp);
    expect(refused.response.status).toBe(403);
    expect(refused.response.body.code).toBe("ACCOUNT_DEACTIVATED");
    expect(
      (await database.operator.findUniqueOrThrow({ where: { id: s.operatorId } })).status,
    ).toBe("INACTIVE");
    expect(
      await database.auditLog.count({
        where: { actorUserId: s.user.id, action: "OPERATOR_DEACTIVATED" },
      }),
    ).toBe(1);
    const back = await as(s.token)
      .post(s.url + "/activate")
      .expect(200);
    expect(back.body.data.status).toBe("ACTIVE");
    expect((await signIn(s.input.username, temp)).response.status).toBe(200);
  });
  it("resets the password to a new temporary one and revokes sessions", async () => {
    const s = await setup();
    const login = await signIn(s.input.username, temp);
    const fresh = "another temporary pass 2";
    await as(s.token)
      .post(s.url + "/reset-password")
      .send({ temporaryPassword: fresh })
      .expect(200);
    await as(login.token).get("/auth/me").expect(401);
    expect((await signIn(s.input.username, temp)).response.status).toBe(401);
    const again = await signIn(s.input.username, fresh);
    expect(again.response.body.data.user.mustChangePassword).toBe(true);
    await as(s.token)
      .post(s.url + "/reset-password")
      .send({ temporaryPassword: "short" })
      .expect(422);
  });
  it("hides another provider's operator with 404 on every verb", async () => {
    const a = await setup();
    const b = await providerSession();
    await as(b.token).get(a.url).expect(404);
    await as(b.token).patch(a.url).send({ fullName: "Hijack" }).expect(404);
    await as(b.token)
      .put(a.url + "/equipment")
      .send({ equipmentIds: [] })
      .expect(404);
    await as(b.token)
      .post(a.url + "/deactivate")
      .expect(404);
    await as(b.token)
      .post(a.url + "/activate")
      .expect(404);
    await as(b.token)
      .post(a.url + "/reset-password")
      .send({ temporaryPassword: temp })
      .expect(404);
    expect((await as(b.token).get("/providers/me/operators")).body.data).toEqual([]);
    expect((await signIn(a.input.username, temp)).response.status).toBe(200);
  });
  it("is open in every provider status except REJECTED and BLACKLISTED", async () => {
    const s = await setup();
    for (const status of ["SUBMITTED", "APPROVED", "SUSPENDED"] as const) {
      await setStatus(s.id, status);
      await create(s.token).expect(201);
      await as(s.token)
        .patch(s.url)
        .send({ fullName: "Fine " + status })
        .expect(200);
    }
    for (const status of ["REJECTED", "BLACKLISTED"] as const) {
      await setStatus(s.id, status);
      expect((await create(s.token).expect(409)).body.code).toBe("INVALID_STATE");
      await as(s.token)
        .post(s.url + "/deactivate")
        .expect(409);
      await as(s.token).get(s.url).expect(200);
    }
    expect(testPassword).toBeTruthy();
  });
});

describe("licence file access", () => {
  it("lets an in-jurisdiction officer view the operator licence (audited) and no one else", async () => {
    const s = await providerSession();
    const file = await licence(s.token);
    await as(s.token)
      .post("/providers/me/operators")
      .send(body({ licenceFileId: file }))
      .expect(201);
    const near = await provisionOfficer("DISTRICT", s.geo.district.id);
    const far = await provisionOfficer("DISTRICT", s.geo.otherDistrict.id);
    await as((await signIn(near.username)).token)
      .get("/files/" + file)
      .expect(200);
    await as((await signIn(far.username)).token)
      .get("/files/" + file)
      .expect(404);
    expect(
      await database.auditLog.count({
        where: { actorUserId: near.id, action: "FILE_VIEW", entityId: file },
      }),
    ).toBe(1);
    const other = await providerSession();
    await as(other.token)
      .get("/files/" + file)
      .expect(404);
  });
});
