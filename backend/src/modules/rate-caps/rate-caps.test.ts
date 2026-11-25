import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionOfficer,
  provisionProvider,
  sampleGeo,
  signIn,
} from "../../../tests/factories.js";
import { addEquipment, providerSession } from "../../../tests/provider-setup.js";

type Geo = Awaited<ReturnType<typeof sampleGeo>>;
let geo: Geo;
let tractor: { id: string };
const op: Record<string, string> = {};

beforeAll(async () => {
  geo = await sampleGeo();
  tractor = await database.serviceCategory.findUniqueOrThrow({ where: { code: "TRACTOR" } });
  for (const o of await database.operation.findMany()) op[o.code] = o.id;
});
beforeEach(clearLoginLimits);
afterEach(async () => {
  await database.appSetting.update({ where: { key: "rateCapsEnabled" }, data: { value: false } });
  await database.rateCap.deleteMany({});
});
afterAll(cleanupFactories);

async function admin() {
  const user = await provisionOfficer("STATE");
  return { user, token: (await signIn(user.username)).token };
}
const cap = (overrides: Record<string, unknown> = {}) => ({
  categoryId: tractor.id,
  operationId: op.PLOUGHING,
  pricingBasis: "ACRE",
  maxRatePaise: 100000,
  ...overrides,
});

describe("settings and permissions", () => {
  it("lets only settings.manage holders read or change the setting, and audits the change", async () => {
    const { user, token } = await admin();
    expect(
      (await as(token).get("/admin/settings/rate-caps-enabled").expect(200)).body.data,
    ).toEqual({ enabled: false });
    expect(
      (await as(token).put("/admin/settings/rate-caps-enabled").send({ enabled: true }).expect(200))
        .body.data,
    ).toEqual({ enabled: true });
    expect((await as(token).get("/admin/settings/rate-caps-enabled")).body.data.enabled).toBe(true);
    const row = await database.appSetting.findUniqueOrThrow({ where: { key: "rateCapsEnabled" } });
    expect(row.updatedById).toBe(user.id);
    expect(
      await database.auditLog.count({
        where: { actorUserId: user.id, action: "RATE_CAPS_TOGGLED" },
      }),
    ).toBe(1);
    await as(token).put("/admin/settings/rate-caps-enabled").send({ enabled: "yes" }).expect(422);
    await as(token)
      .put("/admin/settings/rate-caps-enabled")
      .send({ enabled: true, extra: 1 })
      .expect(422);

    const district = await provisionOfficer("DISTRICT", geo.district.id);
    const dt = (await signIn(district.username)).token;
    for (const t of [
      dt,
      (await signIn((await provisionFarmer()).username)).token,
      (await signIn((await provisionProvider()).username)).token,
    ]) {
      await as(t).get("/admin/settings/rate-caps-enabled").expect(403);
      await as(t).put("/admin/settings/rate-caps-enabled").send({ enabled: true }).expect(403);
      await as(t).get("/admin/rate-caps").expect(403);
      await as(t).post("/admin/rate-caps").send(cap()).expect(403);
    }
    await as("bad").get("/admin/rate-caps").expect(401);
    expect(
      (await database.appSetting.findUniqueOrThrow({ where: { key: "rateCapsEnabled" } })).value,
    ).toBe(true);
  });
});

describe("managing caps", () => {
  it("creates, lists with names and filters, updates and deactivates", async () => {
    const { user, token } = await admin();
    const statewide = (await as(token).post("/admin/rate-caps").send(cap()).expect(201)).body.data;
    expect(statewide).toMatchObject({
      pricingBasis: "ACRE",
      maxRatePaise: 100000,
      isActive: true,
      category: { code: "TRACTOR" },
      operation: { code: "PLOUGHING" },
      district: null,
    });
    const local = (
      await as(token)
        .post("/admin/rate-caps")
        .send(cap({ districtId: geo.district.id, maxRatePaise: 60000 }))
        .expect(201)
    ).body.data;
    expect(local.district.nameEn).toBe("Sample District A");
    await as(token)
      .post("/admin/rate-caps")
      .send(cap({ operationId: op.CULTIVATION }))
      .expect(201);
    expect((await as(token).get("/admin/rate-caps").expect(200)).body.data.total).toBe(3);
    const filtered = (
      await as(token).get(`/admin/rate-caps?operationId=${op.PLOUGHING}`).expect(200)
    ).body.data;
    expect(filtered.items.map((c: { id: string }) => c.id).sort()).toEqual(
      [statewide.id, local.id].sort(),
    );
    expect(
      (await as(token).get(`/admin/rate-caps?districtId=${geo.district.id}`)).body.data.items,
    ).toHaveLength(1);
    await as(token).get("/admin/rate-caps?pageSize=500").expect(422);
    const updated = await as(token)
      .patch("/admin/rate-caps/" + local.id)
      .send({ maxRatePaise: 70000, isActive: false })
      .expect(200);
    expect(updated.body.data).toMatchObject({ maxRatePaise: 70000, isActive: false });
    await as(token)
      .patch("/admin/rate-caps/" + local.id)
      .send({})
      .expect(422);
    await as(token)
      .patch("/admin/rate-caps/" + local.id)
      .send({ maxRatePaise: 50 })
      .expect(422);
    await as(token)
      .patch("/admin/rate-caps/" + local.id)
      .send({ pricingBasis: "HOUR" })
      .expect(422);
    await as(token)
      .patch("/admin/rate-caps/0b0c0d0e-0000-4000-8000-000000000000")
      .send({ isActive: true })
      .expect(404);
    await as(token).patch("/admin/rate-caps/not-a-uuid").send({ isActive: true }).expect(404);
    expect(
      await database.auditLog.count({
        where: { actorUserId: user.id, action: { in: ["RATE_CAP_CREATED", "RATE_CAP_UPDATED"] } },
      }),
    ).toBe(4);
  });
  it("validates the combination and refuses duplicates, allowing a district cap beside a statewide one", async () => {
    const { token } = await admin();
    for (const bad of [
      cap({ operationId: op.SPRAYING }), // not offered for tractors
      cap({ maxRatePaise: 99 }),
      cap({ maxRatePaise: 10.5 }),
      cap({ pricingBasis: "WEEK" }),
      cap({ districtId: "0b0c0d0e-0000-4000-8000-000000000000" }),
      cap({ categoryId: "0b0c0d0e-0000-4000-8000-000000000000" }),
      cap({ extra: true }),
    ])
      await as(token).post("/admin/rate-caps").send(bad).expect(422);
    await as(token).post("/admin/rate-caps").send(cap()).expect(201);
    expect(
      (
        await as(token)
          .post("/admin/rate-caps")
          .send(cap({ maxRatePaise: 5000 }))
          .expect(409)
      ).body.code,
    ).toBe("CAP_EXISTS");
    await as(token)
      .post("/admin/rate-caps")
      .send(cap({ pricingBasis: "HOUR" }))
      .expect(201); // different basis
    await as(token)
      .post("/admin/rate-caps")
      .send(cap({ districtId: geo.district.id }))
      .expect(201);
    await as(token)
      .post("/admin/rate-caps")
      .send(cap({ districtId: geo.district.id }))
      .expect(409);
    await as(token)
      .post("/admin/rate-caps")
      .send(cap({ districtId: geo.otherDistrict.id }))
      .expect(201);
  });
});

describe("inline hint for providers", () => {
  const hint = (token: string, operationId = op.PLOUGHING, basis = "ACRE") =>
    as(token).get(
      `/masters/rate-cap?categoryId=${tractor.id}&operationId=${operationId}&pricingBasis=${basis}`,
    );
  it("shows nothing while caps are off, then the district cap, then the statewide fallback", async () => {
    const s = await providerSession();
    await database.rateCap.createMany({
      data: [
        {
          categoryId: tractor.id,
          operationId: op.PLOUGHING,
          pricingBasis: "ACRE",
          maxRatePaise: 100000,
        },
        {
          categoryId: tractor.id,
          operationId: op.PLOUGHING,
          pricingBasis: "ACRE",
          maxRatePaise: 60000,
          districtId: geo.district.id,
        },
        {
          categoryId: tractor.id,
          operationId: op.CULTIVATION,
          pricingBasis: "ACRE",
          maxRatePaise: 40000,
        },
        {
          categoryId: tractor.id,
          operationId: op.SOWING,
          pricingBasis: "ACRE",
          maxRatePaise: 30000,
          districtId: geo.otherDistrict.id,
        },
        {
          categoryId: tractor.id,
          operationId: op.PUDDLING,
          pricingBasis: "ACRE",
          maxRatePaise: 20000,
          isActive: false,
        },
      ],
    });
    expect((await hint(s.token).expect(200)).body.data).toEqual({
      enabled: false,
      maxRatePaise: null,
      scope: null,
    });
    await database.appSetting.update({ where: { key: "rateCapsEnabled" }, data: { value: true } });
    expect((await hint(s.token)).body.data).toEqual({
      enabled: true,
      maxRatePaise: 60000,
      scope: "DISTRICT",
    });
    expect((await hint(s.token, op.CULTIVATION)).body.data).toEqual({
      enabled: true,
      maxRatePaise: 40000,
      scope: "STATEWIDE",
    });
    expect((await hint(s.token, op.SOWING)).body.data.maxRatePaise).toBeNull(); // another district's cap
    expect((await hint(s.token, op.PUDDLING)).body.data.maxRatePaise).toBeNull(); // inactive
    expect((await hint(s.token, op.PLOUGHING, "HOUR")).body.data.maxRatePaise).toBeNull(); // other basis
  });
  it("validates its query and is for providers with a profile only", async () => {
    const s = await providerSession();
    await as(s.token).get("/masters/rate-cap").expect(422);
    await as(s.token)
      .get(`/masters/rate-cap?categoryId=x&operationId=y&pricingBasis=ACRE`)
      .expect(422);
    await as(s.token)
      .get(
        `/masters/rate-cap?categoryId=${tractor.id}&operationId=${op.PLOUGHING}&pricingBasis=WEEK`,
      )
      .expect(422);
    const farmer = (await signIn((await provisionFarmer()).username)).token;
    await hint(farmer).expect(403);
    await as("bad").get("/masters/rate-cap").expect(401);
    const bare = (await signIn((await provisionProvider()).username)).token;
    expect((await hint(bare).expect(409)).body.code).toBe("PROFILE_REQUIRED");
  });
});

describe("enforcement through the rate card", () => {
  const line = (overrides: Record<string, unknown> = {}) => ({
    operationId: op.PLOUGHING,
    pricingBasis: "ACRE",
    ratePaise: 80000,
    workRateAcresPerHour: 1,
    ...overrides,
  });
  async function withEquipment() {
    const s = await providerSession();
    const eq = await addEquipment(s.id);
    return { ...s, url: `/providers/me/equipment/${eq.id}/services` };
  }
  it("follows caps managed through the admin API: on, off, raised and deactivated", async () => {
    const { token: adminToken } = await admin();
    const s = await withEquipment();
    const created = (
      await as(adminToken)
        .post("/admin/rate-caps")
        .send(cap({ maxRatePaise: 60000 }))
        .expect(201)
    ).body.data;
    await as(s.token).post(s.url).send(line()).expect(201); // setting is off: no enforcement
    const firstId = (await as(s.token).get(s.url)).body.data[0].id as string;
    await as(adminToken).put("/admin/settings/rate-caps-enabled").send({ enabled: true });
    // the existing rate is above the new cap, but unrelated edits are not blocked
    await as(s.token).patch(`${s.url}/${firstId}`).send({ minChargePaise: 1000 }).expect(200);
    await as(s.token).patch(`${s.url}/${firstId}`).send({ ratePaise: 80001 }).expect(422);
    const blocked = await as(s.token)
      .patch(`${s.url}/${firstId}`)
      .send({ ratePaise: 70000 })
      .expect(422);
    expect(blocked.body).toMatchObject({
      code: "RATE_ABOVE_CAP",
      errors: [{ field: "ratePaise" }],
    });
    expect(blocked.body.message).toContain("₹600.00");
    await as(s.token).patch(`${s.url}/${firstId}`).send({ ratePaise: 60000 }).expect(200);
    // raising the cap lets a higher rate through; deactivating it lifts the limit entirely
    await as(adminToken)
      .patch("/admin/rate-caps/" + created.id)
      .send({ maxRatePaise: 90000 })
      .expect(200);
    await as(s.token).patch(`${s.url}/${firstId}`).send({ ratePaise: 85000 }).expect(200);
    await as(adminToken)
      .patch("/admin/rate-caps/" + created.id)
      .send({ isActive: false })
      .expect(200);
    await as(s.token).patch(`${s.url}/${firstId}`).send({ ratePaise: 500000 }).expect(200);
    await as(adminToken)
      .patch("/admin/rate-caps/" + created.id)
      .send({ isActive: true, maxRatePaise: 60000 })
      .expect(200);
    await as(s.token)
      .post(s.url)
      .send(line({ operationId: op.CULTIVATION, ratePaise: 60001 }))
      .expect(201); // no cap for cultivation
    await as(adminToken).put("/admin/settings/rate-caps-enabled").send({ enabled: false });
    await as(s.token).patch(`${s.url}/${firstId}`).send({ ratePaise: 900000 }).expect(200);
  });
});
