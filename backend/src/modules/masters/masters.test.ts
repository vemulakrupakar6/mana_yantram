import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { database } from "../../config/database.js";
import { importGeoCsv } from "./geo-import.js";
import { assertLocationHierarchy } from "./location.js";
import { as, cleanupFactories, provisionFarmer, signIn } from "../../../tests/factories.js";

afterAll(cleanupFactories);
import { resolve } from "node:path";

const get = (path: string) => request(app).get("/api/v1/masters" + path);

describe("geography masters", () => {
  it("serves districts, mandals and villages publicly, sorted by English name", async () => {
    const districts = await get("/districts").expect(200);
    const names: string[] = districts.body.data.map((d: { nameEn: string }) => d.nameEn);
    expect(names).toEqual([...names].sort());
    const a = districts.body.data.find((d: { lgdCode: string }) => d.lgdCode === "T001");
    expect(a).toMatchObject({ nameEn: "Sample District A" });
    expect(a.nameTe).toBeTruthy();
    const mandals = await get(`/districts/${a.id}/mandals`).expect(200);
    expect(mandals.body.data).toHaveLength(2);
    const villages = await get(`/mandals/${mandals.body.data[0].id}/villages`).expect(200);
    expect(villages.body.data).toHaveLength(3);
  });
  it("hides inactive rows and rejects malformed ids", async () => {
    const district = await database.district.findFirstOrThrow({ where: { lgdCode: "T002" } });
    const mandal = await database.mandal.findFirstOrThrow({ where: { districtId: district.id } });
    await database.mandal.update({ where: { id: mandal.id }, data: { isActive: false } });
    try {
      const list = await get(`/districts/${district.id}/mandals`).expect(200);
      expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(mandal.id);
    } finally {
      await database.mandal.update({ where: { id: mandal.id }, data: { isActive: true } });
    }
    await get("/districts/not-a-uuid/mandals").expect(404);
  });
  it("imports the geo CSV idempotently", async () => {
    const file = resolve(import.meta.dirname, "../../../prisma/data/geo.sample.csv");
    const before = await Promise.all([
      database.district.count(),
      database.mandal.count(),
      database.village.count(),
    ]);
    const first = await importGeoCsv(file);
    const second = await importGeoCsv(file);
    expect(second).toEqual(first);
    expect(first).toEqual({ districts: 2, mandals: 4, villages: 12 });
    expect(
      await Promise.all([
        database.district.count(),
        database.mandal.count(),
        database.village.count(),
      ]),
    ).toEqual(before);
  });
});

describe("service masters", () => {
  it("lists categories with operations and required documents", async () => {
    const response = await get("/categories").expect(200);
    const byCode = Object.fromEntries(response.body.data.map((c: { code: string }) => [c.code, c]));
    expect(byCode.DRONE.requiresPilotLicence).toBe(true);
    expect(byCode.DRONE.requiredDocumentTypes).toEqual([
      { code: "DRONE_PILOT_LICENCE", scope: "PROVIDER" },
    ]);
    expect(byCode.TRACTOR.requiredDocumentTypes).toEqual([
      { code: "MACHINE_RC", scope: "EQUIPMENT" },
    ]);
    expect(byCode.TRACTOR.operations.map((o: { code: string }) => o.code).sort()).toEqual([
      "CULTIVATION",
      "HAULAGE",
      "PLOUGHING",
      "PUDDLING",
      "SOWING",
    ]);
    expect(byCode.ROTAVATOR.requiredDocumentTypes).toEqual([]);
  });
  it("lists document types and crops", async () => {
    expect((await get("/document-types").expect(200)).body.data).toHaveLength(5);
    expect((await get("/crops").expect(200)).body.data).toHaveLength(10);
  });
  it("keeps rateCapsEnabled off by default", async () => {
    expect(
      (await database.appSetting.findUniqueOrThrow({ where: { key: "rateCapsEnabled" } })).value,
    ).toBe(false);
  });
});

describe("assertLocationHierarchy", () => {
  it("accepts a valid chain and reports field errors for a mismatch", async () => {
    const a = await database.district.findFirstOrThrow({
      where: { lgdCode: "T001" },
      include: { mandals: { include: { villages: true } } },
    });
    const b = await database.district.findFirstOrThrow({
      where: { lgdCode: "T002" },
      include: { mandals: { include: { villages: true } } },
    });
    const ids = {
      districtId: a.id,
      mandalId: a.mandals[0].id,
      villageId: a.mandals[0].villages[0].id,
    };
    await expect(assertLocationHierarchy(database, ids)).resolves.toBeUndefined();
    await expect(
      assertLocationHierarchy(database, { ...ids, mandalId: b.mandals[0].id }),
    ).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      errors: expect.arrayContaining([expect.objectContaining({ field: "mandalId" })]),
    });
    await expect(
      assertLocationHierarchy(database, { ...ids, villageId: a.mandals[1].villages[0].id }),
    ).rejects.toMatchObject({ errors: [expect.objectContaining({ field: "villageId" })] });
  });
});

describe("IFSC lookup", () => {
  it("requires sign-in, then returns 404 for unknown codes and the row for known ones", async () => {
    await get("/ifsc/SBIN0000001").expect(401);
    const user = await provisionFarmer();
    const { token } = await signIn(user.username);
    await as(token).get("/masters/ifsc/SBIN0000001").expect(404);
    await as(token).get("/masters/ifsc/bad").expect(404);
    await database.ifscCode.upsert({
      where: { ifsc: "TEST0000001" },
      create: { ifsc: "TEST0000001", bank: "Test Bank", branch: "Main" },
      update: {},
    });
    try {
      const found = await as(token).get("/masters/ifsc/test0000001").expect(200);
      expect(found.body.data).toEqual({ ifsc: "TEST0000001", bank: "Test Bank", branch: "Main" });
    } finally {
      await database.ifscCode.delete({ where: { ifsc: "TEST0000001" } });
    }
  });
});
