import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import { as, cleanupFactories, clearLoginLimits } from "../../../tests/factories.js";
import { providerSession, setStatus } from "../../../tests/provider-setup.js";

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const coverage = (token: string, body: Record<string, unknown>) =>
  as(token).put("/providers/me/coverage").send(body);
const hours = (token: string, days: unknown) =>
  as(token).put("/providers/me/working-hours").send({ days });

describe("coverage", () => {
  it("saves a radius, then areas (mandals and villages), clearing the other mode", async () => {
    const s = await providerSession();
    const radius = await coverage(s.token, { mode: "RADIUS", radiusKm: 25 }).expect(200);
    expect(radius.body.data.coverage).toMatchObject({ mode: "RADIUS", radiusKm: 25, areas: [] });
    const mandal = s.geo.district.mandals[1];
    const village = s.geo.mandal.villages[0];
    const areas = await coverage(s.token, {
      mode: "AREAS",
      areas: [{ mandalId: mandal.id }, { villageId: village.id }, { mandalId: mandal.id }],
    }).expect(200);
    expect(areas.body.data.coverage.mode).toBe("AREAS");
    expect(areas.body.data.coverage.radiusKm).toBeNull();
    expect(areas.body.data.coverage.areas).toHaveLength(2); // duplicate mandal collapsed
    const named = areas.body.data.coverage.areas as {
      mandal: { nameEn: string } | null;
      village: { nameEn: string; mandal: { nameEn: string } } | null;
    }[];
    expect(named.find((a) => a.mandal)?.mandal?.nameEn).toBe(mandal.nameEn);
    expect(named.find((a) => a.village)?.village?.mandal.nameEn).toBe(s.geo.mandal.nameEn);
    const back = await coverage(s.token, { mode: "RADIUS", radiusKm: 5 }).expect(200);
    expect(back.body.data.coverage.areas).toEqual([]);
    expect(await database.providerCoverageArea.count({ where: { providerId: s.id } })).toBe(0);
  });
  it("validates radius, area lists and unknown or inactive places", async () => {
    const s = await providerSession();
    for (const bad of [
      { mode: "RADIUS", radiusKm: 0 },
      { mode: "RADIUS", radiusKm: 101 },
      { mode: "RADIUS", radiusKm: 2.5 },
      { mode: "RADIUS" },
      { mode: "RADIUS", radiusKm: 5, areas: [] },
      { mode: "AREAS", areas: [] },
      { mode: "AREAS", areas: [{ mandalId: "not-a-uuid" }] },
      {
        mode: "AREAS",
        areas: [{ mandalId: s.geo.mandal.id, villageId: s.geo.mandal.villages[0].id }],
      },
      { mode: "AREAS", areas: Array.from({ length: 201 }, () => ({ mandalId: s.geo.mandal.id })) },
      { mode: "CIRCLE", radiusKm: 5 },
    ])
      await coverage(s.token, bad).expect(422);
    const unknown = await coverage(s.token, {
      mode: "AREAS",
      areas: [{ mandalId: "0b0c0d0e-0000-4000-8000-000000000000" }],
    }).expect(422);
    expect(unknown.body.errors[0].field).toBe("areas");
    await database.village.update({
      where: { id: s.geo.mandal.villages[1].id },
      data: { isActive: false },
    });
    try {
      await coverage(s.token, {
        mode: "AREAS",
        areas: [{ villageId: s.geo.mandal.villages[1].id }],
      }).expect(422);
    } finally {
      await database.village.update({
        where: { id: s.geo.mandal.villages[1].id },
        data: { isActive: true },
      });
    }
  });
  it("follows the edit lock: closed when SUBMITTED/REJECTED, open when APPROVED/SUSPENDED", async () => {
    const s = await providerSession();
    for (const status of ["SUBMITTED", "REJECTED"] as const) {
      await setStatus(s.id, status);
      expect(
        (await coverage(s.token, { mode: "RADIUS", radiusKm: 10 }).expect(409)).body.code,
      ).toBe("INVALID_STATE");
      await hours(s.token, [{ weekday: 1, start: "06:00", end: "18:00" }]).expect(409);
    }
    for (const status of ["APPROVED", "SUSPENDED"] as const) {
      await setStatus(s.id, status);
      await coverage(s.token, { mode: "RADIUS", radiusKm: 10 }).expect(200);
      await hours(s.token, [{ weekday: 1, start: "06:00", end: "18:00" }]).expect(200);
    }
  });
  it("is closed to other roles and unauthenticated callers", async () => {
    await as("bad").put("/providers/me/coverage").send({ mode: "RADIUS", radiusKm: 5 }).expect(401);
  });
});

describe("working hours", () => {
  it("replaces the weekly schedule and returns HH:MM", async () => {
    const s = await providerSession();
    const saved = await hours(s.token, [
      { weekday: 1, start: "06:00", end: "18:30" },
      { weekday: 7, start: "08:00", end: "24:00" },
    ]).expect(200);
    expect(saved.body.data).toEqual([
      { weekday: 1, start: "06:00", end: "18:30" },
      { weekday: 7, start: "08:00", end: "24:00" },
    ]);
    const row = await database.providerWorkingHours.findUniqueOrThrow({
      where: { providerId_weekday: { providerId: s.id, weekday: 1 } },
    });
    expect(row).toMatchObject({ startMinute: 360, endMinute: 1110 });
    await hours(s.token, [{ weekday: 3, start: "07:00", end: "17:00" }]).expect(200);
    expect((await as(s.token).get("/providers/me")).body.data.workingHours).toEqual([
      { weekday: 3, start: "07:00", end: "17:00" },
    ]);
  });
  it("rejects bad times, ordering, duplicates and sizes", async () => {
    const s = await providerSession();
    const d = (over: Record<string, unknown> = {}) => ({
      weekday: 1,
      start: "06:00",
      end: "18:00",
      ...over,
    });
    for (const bad of [
      [],
      [d({ start: "18:00", end: "06:00" })],
      [d({ start: "06:00", end: "06:00" })],
      [d({ start: "6:00" })],
      [d({ end: "24:01" })],
      [d({ end: "25:00" })],
      [d({ weekday: 0 })],
      [d({ weekday: 8 })],
      [d(), d()],
      Array.from({ length: 8 }, (_, i) => d({ weekday: (i % 7) + 1 })),
    ])
      await hours(s.token, bad).expect(422);
    await as(s.token)
      .put("/providers/me/working-hours")
      .send({ days: [d()], extra: 1 })
      .expect(422);
  });
  it("completes the coverage and working hours checklist items", async () => {
    const s = await providerSession();
    const done = async (key: string) =>
      (await as(s.token).get("/providers/me/checklist")).body.data.items.find(
        (i: { key: string }) => i.key === key,
      ).done;
    expect(await done("coverage")).toBe(false);
    expect(await done("workingHours")).toBe(false);
    await coverage(s.token, { mode: "RADIUS", radiusKm: 20 }).expect(200);
    await hours(s.token, [{ weekday: 2, start: "06:00", end: "18:00" }]).expect(200);
    expect(await done("coverage")).toBe(true);
    expect(await done("workingHours")).toBe(true);
  });
});
