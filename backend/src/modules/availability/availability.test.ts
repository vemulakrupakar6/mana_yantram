import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import { as, cleanupFactories, clearLoginLimits } from "../../../tests/factories.js";
import { addEquipment, providerSession, setStatus } from "../../../tests/provider-setup.js";

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const hour = 3_600_000;
const day = 24 * hour;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const block = (start: number, end: number, reason = "Servicing") => ({
  startsAt: at(start),
  endsAt: at(end),
  reason,
});
async function setup() {
  const s = await providerSession();
  const eq = await addEquipment(s.id, "TRACTOR", 2);
  return { ...s, unit: eq.units[0].id, other: eq.units[1].id };
}
const post = (token: string, unit: string, body: unknown) =>
  as(token)
    .post(`/providers/me/units/${unit}/blocks`)
    .send(body as object);

describe("availability blocks", () => {
  it("creates, lists (all and per unit) and deletes a block", async () => {
    const s = await setup();
    const created = await post(s.token, s.unit, block(1 * day, 3 * day)).expect(201);
    expect(created.body.data).toMatchObject({
      reason: "Servicing",
      unitId: s.unit,
      unitLabel: "Unit 1",
      equipment: { make: "Mahindra" },
    });
    await post(s.token, s.other, block(10 * day, 12 * day, "Repairs")).expect(201);
    const all = await as(s.token).get("/providers/me/availability").expect(200);
    expect(all.body.data).toHaveLength(2);
    const one = await as(s.token).get(`/providers/me/units/${s.unit}/blocks`).expect(200);
    expect(one.body.data.map((b: { id: string }) => b.id)).toEqual([created.body.data.id]);
    const narrow = await as(s.token)
      .get(
        `/providers/me/availability?from=${encodeURIComponent(at(8 * day))}&to=${encodeURIComponent(at(20 * day))}`,
      )
      .expect(200);
    expect(narrow.body.data).toHaveLength(1);
    await as(s.token)
      .delete(`/providers/me/units/${s.unit}/blocks/${created.body.data.id}`)
      .expect(200);
    expect((await as(s.token).get("/providers/me/availability")).body.data).toHaveLength(1);
    await as(s.token)
      .delete(`/providers/me/units/${s.unit}/blocks/${created.body.data.id}`)
      .expect(404);
    expect(
      await database.auditLog.count({
        where: { actorUserId: s.user.id, action: { startsWith: "AVAILABILITY_BLOCK" } },
      }),
    ).toBe(3);
  });
  it("rejects overlaps with 409 but allows adjacent blocks and other units", async () => {
    const s = await setup();
    await post(s.token, s.unit, block(1 * day, 3 * day)).expect(201);
    for (const [start, end] of [
      [2, 4],
      [0.5, 1.5],
      [1, 3],
      [0, 10],
      [1.5, 2.5],
    ] as const) {
      const clash = await post(s.token, s.unit, block(start * day, end * day)).expect(409);
      expect(clash.body.code).toBe("BLOCK_OVERLAP");
    }
    // Adjacent means sharing a boundary instant exactly, so read the stored boundaries back.
    const stored = await database.availabilityBlock.findFirstOrThrow({
      where: { equipmentUnitId: s.unit },
    });
    const before = {
      startsAt: at(0.2 * day),
      endsAt: stored.startsAt.toISOString(),
      reason: "Before",
    };
    const after = { startsAt: stored.endsAt.toISOString(), endsAt: at(5 * day), reason: "After" };
    await post(s.token, s.unit, before).expect(201); // new.end == existing.start
    await post(s.token, s.unit, after).expect(201); // new.start == existing.end
    await post(s.token, s.other, block(1 * day, 3 * day)).expect(201);
  });
  it("lets exactly one of several simultaneous identical requests win", async () => {
    const s = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => post(s.token, s.unit, block(1 * day, 2 * day))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await database.availabilityBlock.count({ where: { equipmentUnitId: s.unit } })).toBe(1);
  });
  it("validates times, reason and range limits", async () => {
    const s = await setup();
    for (const bad of [
      block(2 * day, 1 * day),
      block(1 * day, 1 * day),
      block(-3 * day, -1 * day),
      block(0, 181 * day),
      { ...block(1 * day, 2 * day), reason: "ab" },
      { ...block(1 * day, 2 * day), reason: "x".repeat(201) },
      { startsAt: "tomorrow", endsAt: at(2 * day), reason: "Servicing" },
      { ...block(1 * day, 2 * day), extra: true },
    ])
      await post(s.token, s.unit, bad).expect(422);
    await post(s.token, s.unit, block(-1 * day, 179 * day)).expect(201); // may already be in progress
    await as(s.token)
      .get(
        `/providers/me/availability?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(93 * day))}`,
      )
      .expect(422);
    await as(s.token)
      .get(
        `/providers/me/availability?from=${encodeURIComponent(at(2 * day))}&to=${encodeURIComponent(at(1 * day))}`,
      )
      .expect(422);
    await as(s.token).get("/providers/me/availability?from=garbage").expect(422);
  });
  it("hides other providers' units with 404 on every verb", async () => {
    const a = await setup();
    const b = await providerSession();
    const made = (await post(a.token, a.unit, block(1 * day, 2 * day)).expect(201)).body.data
      .id as string;
    await post(b.token, a.unit, block(1 * day, 2 * day)).expect(404);
    await as(b.token).get(`/providers/me/units/${a.unit}/blocks`).expect(404);
    await as(b.token).delete(`/providers/me/units/${a.unit}/blocks/${made}`).expect(404);
    await as(a.token).delete(`/providers/me/units/${a.other}/blocks/${made}`).expect(404); // wrong unit for the block
    expect((await as(b.token).get("/providers/me/availability")).body.data).toEqual([]);
    await post(a.token, "not-a-uuid", block(1 * day, 2 * day)).expect(404);
  });
  it("is blocked only for REJECTED and BLACKLISTED providers", async () => {
    const s = await setup();
    for (const status of ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED", "SUSPENDED"] as const) {
      await setStatus(s.id, status);
      const made = await post(s.token, s.unit, block(1 * day, 2 * day)).expect(201);
      await as(s.token)
        .delete(`/providers/me/units/${s.unit}/blocks/${made.body.data.id}`)
        .expect(200);
    }
    for (const status of ["REJECTED", "BLACKLISTED"] as const) {
      await setStatus(s.id, status);
      expect((await post(s.token, s.unit, block(1 * day, 2 * day)).expect(409)).body.code).toBe(
        "INVALID_STATE",
      );
      await as(s.token).get("/providers/me/availability").expect(200);
    }
  });
});
