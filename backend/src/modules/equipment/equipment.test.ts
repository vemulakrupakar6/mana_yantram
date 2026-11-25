import { existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionProvider,
  sampleGeo,
  signIn,
} from "../../../tests/factories.js";
import { absolutePath } from "../files/files.storage.js";

type Geo = Awaited<ReturnType<typeof sampleGeo>>;
let geo: Geo;
const cat: Record<string, { id: string }> = {};
const op: Record<string, { id: string }> = {};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  geo = await sampleGeo();
  for (const c of await database.serviceCategory.findMany()) cat[c.code] = c;
  for (const o of await database.operation.findMany()) op[o.code] = o;
});
beforeEach(clearLoginLimits);
afterEach(async () => {
  await database.appSetting.update({ where: { key: "rateCapsEnabled" }, data: { value: false } });
  await database.rateCap.deleteMany({});
});
afterAll(cleanupFactories);

async function session() {
  const user = await provisionProvider();
  const { token } = await signIn(user.username);
  const id = (
    await as(token)
      .post("/providers/me")
      .send({
        type: "INDIVIDUAL",
        name: "Sri Rama Agro",
        contactPerson: "Rama Rao",
        mobile: "9" + String(randomInt(0, 1e9)).padStart(9, "0"),
        addressLine: "Main road, bus stand",
        districtId: geo.district.id,
        mandalId: geo.mandal.id,
        villageId: geo.mandal.villages[0].id,
        baseLatitude: 17.4,
        baseLongitude: 78.5,
      })
      .expect(201)
  ).body.data.id as string;
  return { user, token, id };
}
type Session = Awaited<ReturnType<typeof session>>;
const photo = async (token: string) =>
  (
    await as(token)
      .post("/files")
      .field("purpose", "EQUIPMENT_PHOTO")
      .attach("file", png, "p.png")
      .expect(201)
  ).body.data.id as string;
async function create(s: Session, overrides: Record<string, unknown> = {}, photos = 1) {
  const photoFileIds = await Promise.all(Array.from({ length: photos }, () => photo(s.token)));
  return as(s.token)
    .post("/providers/me/equipment")
    .send({
      categoryId: cat.TRACTOR.id,
      make: "Mahindra",
      model: "575 DI",
      year: 2021,
      numberOfUnits: 2,
      photoFileIds,
      ...overrides,
    });
}
const setStatus = (id: string, status: "SUBMITTED" | "APPROVED" | "REJECTED") =>
  database.provider.update({ where: { id }, data: { status } });
const service = (operationId: string, overrides: Record<string, unknown> = {}) => ({
  operationId,
  pricingBasis: "ACRE",
  ratePaise: 80000,
  workRateAcresPerHour: 1.5,
  ...overrides,
});

describe("create equipment", () => {
  it("creates N units, attaches ordered photos and lists it", async () => {
    const s = await session();
    const created = await (
      await create(
        s,
        { numberOfUnits: 3, capacityValue: 50, capacityUnit: "HP", implements: ["Plough"] },
        2,
      )
    ).body;
    expect(created.data).toMatchObject({
      make: "Mahindra",
      year: 2021,
      status: "ACTIVE",
      capacityValue: "50.00",
      capacityUnit: "HP",
      implements: ["Plough"],
      category: { code: "TRACTOR", requiresPilotLicence: false },
    });
    expect(created.data.units.map((u: { unitLabel: string }) => u.unitLabel)).toEqual([
      "Unit 1",
      "Unit 2",
      "Unit 3",
    ]);
    expect(created.data.photos).toHaveLength(2);
    expect(created.data.photos[0].url).toMatch(/^\/api\/v1\/files\//);
    const files = await database.storedFile.findMany({
      where: { entityType: "equipment", entityId: created.data.id },
    });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.attachedAt)).toBe(true);
    const list = (await as(s.token).get("/providers/me/equipment").expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ unitCount: 3, serviceCount: 0 });
    expect(list[0].units.map((u: { unitLabel: string }) => u.unitLabel)).toEqual([
      "Unit 1",
      "Unit 2",
      "Unit 3",
    ]);
    expect(list[0].firstPhoto.id).toBe(created.data.photos[0].id);
    expect((await as(s.token).get("/providers/me").expect(200)).body.data.counts).toMatchObject({
      equipment: 1,
      units: 3,
    });
  });
  it("rejects 0 or 6 photos, bad units, years, capacity pairs and unknown categories", async () => {
    const s = await session();
    expect((await create(s, {}, 0)).status).toBe(422);
    expect((await create(s, {}, 6)).status).toBe(422);
    for (const bad of [
      { numberOfUnits: 0 },
      { numberOfUnits: 51 },
      { year: 1979 },
      { year: new Date().getFullYear() + 2 },
      { capacityValue: 50 },
      { capacityUnit: "HP" },
      { capacityValue: 50, capacityUnit: "STONES" },
      { implements: Array.from({ length: 11 }, (_, i) => "i" + i) },
      { categoryId: "0b0c0d0e-0000-4000-8000-000000000000" },
      { make: "" },
    ])
      expect((await create(s, bad)).status).toBe(422);
  });
  it("refuses photos that are not yours, are attached already, or are the wrong bucket", async () => {
    const a = await session();
    const b = await session();
    const theirs = await photo(b.token);
    const stolen = await as(a.token)
      .post("/providers/me/equipment")
      .send({
        categoryId: cat.TRACTOR.id,
        make: "M",
        model: "X",
        year: 2020,
        numberOfUnits: 1,
        photoFileIds: [theirs],
      });
    expect(stolen.status).toBe(422);
    expect(stolen.body.code).toBe("FILE_NOT_AVAILABLE");
    const first = await create(a);
    expect(first.status).toBe(201);
    const reused = first.body.data.photos[0].id;
    expect((await create(a, { photoFileIds: [reused] })).status).toBe(422);
    const doc = (
      await as(a.token).post("/files").field("purpose", "DOCUMENT").attach("file", png, "d.png")
    ).body.data.id;
    expect((await create(a, { photoFileIds: [doc] })).status).toBe(422);
    // a failed create leaves no equipment behind
    expect(await database.equipment.count({ where: { providerId: a.id } })).toBe(1);
  });
  it("requires a provider profile and the provider role", async () => {
    const user = await provisionProvider();
    const { token } = await signIn(user.username);
    expect((await as(token).get("/providers/me/equipment").expect(409)).body.code).toBe(
      "PROFILE_REQUIRED",
    );
    const farmer = await provisionFarmer();
    await as((await signIn(farmer.username)).token)
      .get("/providers/me/equipment")
      .expect(403);
  });
  it("adds the machine RC (per tractor) to the required documents", async () => {
    const s = await session();
    const eq = (await create(s)).body.data.id as string;
    const docs = (await as(s.token).get("/providers/me/documents")).body.data as {
      documentTypeCode: string;
      equipmentId: string | null;
    }[];
    expect(
      docs.filter((d) => d.documentTypeCode === "MACHINE_RC").map((d) => d.equipmentId),
    ).toEqual([eq]);
  });
});

describe("edit lock and ownership", () => {
  it("is open in DRAFT/APPROVED, locked when SUBMITTED or REJECTED", async () => {
    const s = await session();
    const eq = (await create(s)).body.data.id as string;
    await as(s.token)
      .patch("/providers/me/equipment/" + eq)
      .send({ model: "New" })
      .expect(200);
    await setStatus(s.id, "APPROVED");
    await as(s.token)
      .patch("/providers/me/equipment/" + eq)
      .send({ model: "After approval" })
      .expect(200);
    await as(s.token).post(`/providers/me/equipment/${eq}/units`).send({ count: 1 }).expect(201);
    for (const status of ["SUBMITTED", "REJECTED"] as const) {
      await setStatus(s.id, status);
      expect(
        (
          await as(s.token)
            .patch("/providers/me/equipment/" + eq)
            .send({ model: "x" })
            .expect(409)
        ).body.code,
      ).toBe("INVALID_STATE");
      expect((await create(s)).status).toBe(409);
      await as(s.token).post(`/providers/me/equipment/${eq}/deactivate`).expect(409);
      await as(s.token)
        .post(`/providers/me/equipment/${eq}/services`)
        .send(service(op.PLOUGHING.id))
        .expect(409);
      await as(s.token)
        .get("/providers/me/equipment/" + eq)
        .expect(200); // reads stay open
    }
  });
  it("hides other providers' equipment, units and services with 404 on every verb", async () => {
    const a = await session();
    const b = await session();
    const eq = (await create(a)).body.data;
    const unit = eq.units[0].id as string;
    const svc = (
      await as(a.token)
        .post(`/providers/me/equipment/${eq.id}/services`)
        .send(service(op.PLOUGHING.id))
        .expect(201)
    ).body.data.id as string;
    const base = "/providers/me/equipment/" + eq.id;
    await as(b.token).get(base).expect(404);
    await as(b.token).patch(base).send({ model: "x" }).expect(404);
    await as(b.token)
      .post(base + "/deactivate")
      .expect(404);
    await as(b.token)
      .put(base + "/photos")
      .send({ fileIds: [await photo(b.token)] })
      .expect(404);
    await as(b.token)
      .get(base + "/units")
      .expect(404);
    await as(b.token)
      .post(base + "/units")
      .send({ count: 1 })
      .expect(404);
    await as(b.token).patch(`${base}/units/${unit}`).send({ status: "INACTIVE" }).expect(404);
    await as(b.token)
      .get(base + "/services")
      .expect(404);
    await as(b.token)
      .post(base + "/services")
      .send(service(op.PLOUGHING.id))
      .expect(404);
    await as(b.token).patch(`${base}/services/${svc}`).send({ ratePaise: 100 }).expect(404);
    await as(b.token).delete(`${base}/services/${svc}`).expect(404);
    expect((await as(b.token).get("/providers/me/equipment")).body.data).toEqual([]);
    await as(a.token)
      .get(base + "/services")
      .expect(200);
  });
  it("updates fields, protects the category when dependants exist and toggles status", async () => {
    const s = await session();
    const eq = (await create(s)).body.data.id as string;
    const base = "/providers/me/equipment/" + eq;
    const updated = await as(s.token)
      .patch(base)
      .send({ capacityValue: 60, capacityUnit: "HP", year: 2019 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ capacityValue: "60.00", year: 2019 });
    await as(s.token).patch(base).send({ capacityValue: null }).expect(422); // unit would be orphaned
    await as(s.token).patch(base).send({ capacityValue: null, capacityUnit: null }).expect(200);
    await as(s.token).patch(base).send({ categoryId: cat.ROTAVATOR.id }).expect(200); // nothing depends on it yet
    await as(s.token).patch(base).send({ categoryId: cat.TRACTOR.id }).expect(200);
    await as(s.token)
      .post(base + "/services")
      .send(service(op.PLOUGHING.id))
      .expect(201);
    const blocked = await as(s.token)
      .patch(base)
      .send({ categoryId: cat.ROTAVATOR.id })
      .expect(409);
    expect(blocked.body.code).toBe("INVALID_STATE");
    expect(
      (
        await as(s.token)
          .post(base + "/deactivate")
          .expect(200)
      ).body.data.status,
    ).toBe("INACTIVE");
    const docs = (await as(s.token).get("/providers/me/documents")).body.data as {
      documentTypeCode: string;
    }[];
    expect(docs.some((d) => d.documentTypeCode === "MACHINE_RC")).toBe(false);
    expect(
      (
        await as(s.token)
          .post(base + "/activate")
          .expect(200)
      ).body.data.status,
    ).toBe("ACTIVE");
    await as(s.token).patch(base).send({}).expect(422);
    await as(s.token).patch(base).send({ providerId: "x" }).expect(422);
  });
});

describe("photos", () => {
  it("keeps, adds, reorders and removes photos (removed ones are soft-deleted)", async () => {
    const s = await session();
    const eq = (await create(s, {}, 2)).body.data;
    const [p1, p2] = eq.photos.map((p: { id: string }) => p.id) as string[];
    const p3 = await photo(s.token);
    const base = `/providers/me/equipment/${eq.id}/photos`;
    const response = await as(s.token)
      .put(base)
      .send({ fileIds: [p3, p2] })
      .expect(200);
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([p3, p2]);
    const gone = await database.storedFile.findUniqueOrThrow({ where: { id: p1 } });
    expect(gone.deletedAt).not.toBeNull();
    expect(existsSync(absolutePath(gone.relPath))).toBe(true);
    await as(s.token)
      .get("/files/" + p1)
      .expect(404);
    expect(await database.equipmentPhoto.count({ where: { equipmentId: eq.id } })).toBe(2);
    await as(s.token).put(base).send({ fileIds: [] }).expect(422);
    await as(s.token)
      .put(base)
      .send({ fileIds: [p3, p3] })
      .expect(422);
    const six = await Promise.all(Array.from({ length: 6 }, () => photo(s.token)));
    await as(s.token).put(base).send({ fileIds: six }).expect(422);
    expect(
      (
        await as(s.token)
          .put(base)
          .send({ fileIds: [p1] })
          .expect(422)
      ).body.code,
    ).toBe("FILE_NOT_AVAILABLE");
  });
});

describe("units", () => {
  it("adds units with the next labels, enforces the limit and validates details", async () => {
    const s = await session();
    const eq = (await create(s, { numberOfUnits: 2 })).body.data.id as string;
    const base = `/providers/me/equipment/${eq}/units`;
    const added = await as(s.token).post(base).send({ count: 2 }).expect(201);
    expect(added.body.data.map((u: { unitLabel: string }) => u.unitLabel)).toEqual([
      "Unit 1",
      "Unit 2",
      "Unit 3",
      "Unit 4",
    ]);
    await as(s.token).post(base).send({ count: 0 }).expect(422);
    await as(s.token).post(base).send({ count: 21 }).expect(422);
    await as(s.token).post(base).send({ count: 20 }).expect(201);
    await as(s.token).post(base).send({ count: 20 }).expect(201);
    expect((await as(s.token).post(base).send({ count: 10 }).expect(422)).body.code).toBe(
      "UNIT_LIMIT",
    );
    const unit = added.body.data[0].id as string;
    const patched = await as(s.token)
      .patch(`${base}/${unit}`)
      .send({ registrationNo: "ts09ab1234" })
      .expect(200);
    expect(patched.body.data.registrationNo).toBe("TS09AB1234");
    for (const bad of ["TS 09 AB 1234", "1234", "TS09AB12345"])
      await as(s.token).patch(`${base}/${unit}`).send({ registrationNo: bad }).expect(422);
    expect(
      (await as(s.token).patch(`${base}/${unit}`).send({ droneUin: "UIN-1" }).expect(422)).body
        .errors[0].field,
    ).toBe("droneUin");
    await as(s.token).patch(`${base}/${unit}`).send({ status: "INACTIVE" }).expect(200);
    await as(s.token).patch(`${base}/${unit}`).send({ registrationNo: null }).expect(200);
    await as(s.token)
      .patch(`${base}/0b0c0d0e-0000-4000-8000-000000000000`)
      .send({ status: "ACTIVE" })
      .expect(404);
  });
  it("accepts a drone UIN only for drone equipment", async () => {
    const s = await session();
    const drone = (await create(s, { categoryId: cat.DRONE.id, numberOfUnits: 1 })).body.data;
    const res = await as(s.token)
      .patch(`/providers/me/equipment/${drone.id}/units/${drone.units[0].id}`)
      .send({ droneUin: "UIN-12345" })
      .expect(200);
    expect(res.body.data.droneUin).toBe("UIN-12345");
    const docs = (await as(s.token).get("/providers/me/documents")).body.data as {
      documentTypeCode: string;
    }[];
    expect(docs.filter((d) => d.documentTypeCode === "DRONE_PILOT_LICENCE")).toHaveLength(1);
  });
});

describe("rate card", () => {
  const url = (eq: string) => `/providers/me/equipment/${eq}/services`;
  async function withEquipment() {
    const s = await session();
    const eq = (await create(s)).body.data.id as string;
    return { ...s, eq };
  }
  it("creates a service in paise and lists it", async () => {
    const s = await withEquipment();
    const created = await as(s.token)
      .post(url(s.eq))
      .send(service(op.PLOUGHING.id, { minChargePaise: 50000 }))
      .expect(201);
    expect(created.body.data).toMatchObject({
      pricingBasis: "ACRE",
      ratePaise: 80000,
      minChargePaise: 50000,
      travelMode: "NONE",
      workRateAcresPerHour: "1.50",
      isActive: true,
      operation: { code: "PLOUGHING" },
    });
    expect((await as(s.token).get(url(s.eq)).expect(200)).body.data).toHaveLength(1);
    const checked = (await as(s.token).get("/providers/me/checklist")).body.data.items.find(
      (i: { key: string }) => i.key === "equipment",
    );
    expect(checked).toMatchObject({ done: true, detail: { active: 1, incomplete: 0 } });
  });
  it("rejects operations outside the category, bad money and bad travel combinations", async () => {
    const s = await withEquipment();
    const outside = await as(s.token).post(url(s.eq)).send(service(op.SPRAYING.id)).expect(422);
    expect(outside.body.errors[0].field).toBe("operationId");
    await as(s.token)
      .post(url(s.eq))
      .send(service("0b0c0d0e-0000-4000-8000-000000000000"))
      .expect(422);
    for (const bad of [
      { ratePaise: 99 },
      { ratePaise: 800.5 },
      { minChargePaise: -1 },
      { workRateAcresPerHour: 0.05 },
      { workRateAcresPerHour: 51 },
      { pricingBasis: "WEEK" },
      { travelMode: "FLAT" },
      { travelMode: "FLAT", travelFlatPaise: 1000, travelPerKmPaise: 500 },
      { travelMode: "PER_KM" },
      { travelMode: "PER_KM", travelPerKmPaise: 0 },
      { travelMode: "PER_KM", travelPerKmPaise: 500, travelFlatPaise: 100 },
      { travelMode: "NONE", travelFlatPaise: 100 },
      { freeRadiusKm: 5 },
    ])
      await as(s.token).post(url(s.eq)).send(service(op.PLOUGHING.id, bad)).expect(422);
    await as(s.token)
      .post(url(s.eq))
      .send(service(op.PLOUGHING.id, { travelMode: "FLAT", travelFlatPaise: 20000 }))
      .expect(201);
    await as(s.token)
      .post(url(s.eq))
      .send(
        service(op.CULTIVATION.id, {
          travelMode: "PER_KM",
          travelPerKmPaise: 1500,
          freeRadiusKm: 5,
        }),
      )
      .expect(201);
    expect(await database.equipmentService.count({ where: { equipmentId: s.eq } })).toBe(2);
  });
  it("returns 409 for a duplicate operation, but revives a removed one", async () => {
    const s = await withEquipment();
    const first = (await as(s.token).post(url(s.eq)).send(service(op.PLOUGHING.id)).expect(201))
      .body.data.id as string;
    expect(
      (await as(s.token).post(url(s.eq)).send(service(op.PLOUGHING.id)).expect(409)).body.code,
    ).toBe("SERVICE_EXISTS");
    await as(s.token)
      .delete(`${url(s.eq)}/${first}`)
      .expect(200);
    await as(s.token)
      .delete(`${url(s.eq)}/${first}`)
      .expect(404);
    const revived = await as(s.token)
      .post(url(s.eq))
      .send(service(op.PLOUGHING.id, { ratePaise: 90000 }))
      .expect(201);
    expect(revived.body.data).toMatchObject({ id: first, ratePaise: 90000, isActive: true });
  });
  it("patches by merging, clearing travel fields when the mode changes", async () => {
    const s = await withEquipment();
    const id = (
      await as(s.token)
        .post(url(s.eq))
        .send(
          service(op.PLOUGHING.id, {
            travelMode: "PER_KM",
            travelPerKmPaise: 1500,
            freeRadiusKm: 5,
          }),
        )
        .expect(201)
    ).body.data.id as string;
    const one = `${url(s.eq)}/${id}`;
    await as(s.token).patch(one).send({ minChargePaise: 25000 }).expect(200);
    const rate = await as(s.token).patch(one).send({ ratePaise: 95000 }).expect(200);
    expect(rate.body.data.minChargePaise).toBe(25000); // untouched fields survive a patch
    expect(rate.body.data).toMatchObject({
      ratePaise: 95000,
      travelPerKmPaise: 1500,
      freeRadiusKm: "5.00",
    });
    const flat = await as(s.token)
      .patch(one)
      .send({ travelMode: "FLAT", travelFlatPaise: 30000 })
      .expect(200);
    expect(flat.body.data).toMatchObject({
      travelMode: "FLAT",
      travelFlatPaise: 30000,
      travelPerKmPaise: null,
      freeRadiusKm: null,
    });
    const none = await as(s.token).patch(one).send({ travelMode: "NONE" }).expect(200);
    expect(none.body.data).toMatchObject({ travelMode: "NONE", travelFlatPaise: null });
    await as(s.token).patch(one).send({ travelMode: "FLAT" }).expect(422);
    await as(s.token).patch(one).send({ ratePaise: 5 }).expect(422);
    await as(s.token).patch(one).send({ operationId: op.CULTIVATION.id }).expect(422);
    await as(s.token).patch(one).send({}).expect(422);
  });
  it("enforces rate caps only while the setting is on, preferring the district cap", async () => {
    const s = await withEquipment();
    await database.rateCap.createMany({
      data: [
        {
          categoryId: cat.TRACTOR.id,
          operationId: op.PLOUGHING.id,
          pricingBasis: "ACRE",
          maxRatePaise: 100000,
        },
        {
          categoryId: cat.TRACTOR.id,
          operationId: op.PLOUGHING.id,
          pricingBasis: "ACRE",
          maxRatePaise: 60000,
          districtId: geo.district.id,
        },
      ],
    });
    // setting off: no enforcement
    const id = (
      await as(s.token)
        .post(url(s.eq))
        .send(service(op.PLOUGHING.id, { ratePaise: 500000 }))
        .expect(201)
    ).body.data.id as string;
    await database.appSetting.update({ where: { key: "rateCapsEnabled" }, data: { value: true } });
    const over = await as(s.token)
      .patch(`${url(s.eq)}/${id}`)
      .send({ ratePaise: 70000 })
      .expect(422);
    expect(over.body.code).toBe("RATE_ABOVE_CAP");
    expect(over.body.errors[0].field).toBe("ratePaise");
    expect(over.body.message).toContain("₹600.00");
    await as(s.token)
      .patch(`${url(s.eq)}/${id}`)
      .send({ ratePaise: 60000 })
      .expect(200);
    await as(s.token)
      .delete(`${url(s.eq)}/${id}`)
      .expect(200);
    expect(
      (
        await as(s.token)
          .post(url(s.eq))
          .send(service(op.PLOUGHING.id, { ratePaise: 60001 }))
          .expect(422)
      ).body.code,
    ).toBe("RATE_ABOVE_CAP");
    // statewide fallback applies to operations without a district cap
    await database.rateCap.create({
      data: {
        categoryId: cat.TRACTOR.id,
        operationId: op.CULTIVATION.id,
        pricingBasis: "ACRE",
        maxRatePaise: 40000,
      },
    });
    await as(s.token)
      .post(url(s.eq))
      .send(service(op.CULTIVATION.id, { ratePaise: 40001 }))
      .expect(422);
    await as(s.token)
      .post(url(s.eq))
      .send(service(op.CULTIVATION.id, { ratePaise: 40000 }))
      .expect(201);
    // a different pricing basis has no cap
    await as(s.token)
      .post(url(s.eq))
      .send(service(op.HAULAGE.id, { pricingBasis: "HOUR", ratePaise: 999999 }))
      .expect(201);
  });
});
