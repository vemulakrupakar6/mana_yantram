import { randomInt } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import { verhoeffCheckDigit } from "../../utils/verhoeff.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionOfficer,
  sampleGeo,
  signIn,
  testPassword,
  uniqueName,
} from "../../../tests/factories.js";

type Geo = Awaited<ReturnType<typeof sampleGeo>>;
let geo: Geo;
let cropId: string;
const year = new Date().getFullYear();

beforeAll(async () => {
  geo = await sampleGeo();
  cropId = (await database.crop.findFirstOrThrow({ where: { code: "PADDY" } })).id;
});
beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const aadhaar = () => {
  const base = String(randomInt(2, 10)) + String(randomInt(0, 1e10)).padStart(10, "0");
  return base + verhoeffCheckDigit(base);
};
const mobile = () => "9" + String(randomInt(0, 1e9)).padStart(9, "0");
const village = () => geo.mandal.villages[0];
const profile = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Ravi Kumar",
  relationType: "FATHER",
  relativeName: "Suresh Kumar",
  gender: "MALE",
  mobile: mobile(),
  districtId: geo.district.id,
  mandalId: geo.mandal.id,
  villageId: village().id,
  preferredLanguage: "te",
  notifications: { sms: true, inApp: true, push: false },
  ...overrides,
});
const plot = (overrides: Record<string, unknown> = {}) => ({
  surveyNo: "12/A",
  extentAcres: 2.5,
  villageId: village().id,
  latitude: 17.385,
  longitude: 78.4867,
  crops: [{ cropId, season: "KHARIF", year }],
  ...overrides,
});
async function farmerSession(withProfile = true) {
  const user = await provisionFarmer();
  const { token } = await signIn(user.username);
  if (withProfile) await as(token).post("/farmers/me").send(profile()).expect(201);
  return { user, token };
}

describe("farmer profile", () => {
  it("creates the profile, sets mobile and language, completes onboarding, then rejects a second", async () => {
    const { user, token } = await farmerSession(false);
    const body = profile({ aadhaarNumber: aadhaar() });
    const created = await as(token).post("/farmers/me").send(body).expect(201);
    expect(created.body.data).toMatchObject({
      fullName: "Ravi Kumar",
      mobile: body.mobile,
      preferredLanguage: "te",
      notifications: { sms: true, inApp: true, push: false },
      district: { nameEn: "Sample District A" },
      aadhaar: { verified: false },
    });
    expect(created.body.data.aadhaar.masked).toMatch(/^XXXX XXXX \d{4}$/);
    const row = await database.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ mobile: body.mobile, preferredLanguage: "te" });
    const me = await as(token).get("/auth/me").expect(200);
    expect(me.body.data.onboarding.FARMER).toBe("COMPLETED");
    expect((await as(token).post("/farmers/me").send(profile()).expect(409)).body.code).toBe(
      "PROFILE_EXISTS",
    );
  });
  it("never stores or returns the full Aadhaar number", async () => {
    const { user, token } = await farmerSession(false);
    const number = aadhaar();
    const created = await as(token)
      .post("/farmers/me")
      .send(profile({ aadhaarNumber: number.replace(/(\d{4})(\d{4})/, "$1 $2 ") }))
      .expect(201);
    const farmer = await database.farmer.findUniqueOrThrow({ where: { userId: user.id } });
    const everything = JSON.stringify([
      farmer,
      await database.user.findUniqueOrThrow({ where: { id: user.id } }),
      await database.auditLog.findMany({ where: { actorUserId: user.id } }),
      created.body,
      (await as(token).get("/farmers/me")).body,
    ]);
    expect(everything).not.toContain(number);
    // Ids and the keyed hash are hex and can legitimately contain a 12-digit decimal run, so
    // they are removed before looking for any stray 12-digit number-like value.
    const withoutIdentifiers = everything
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
      .replace(/[0-9a-f]{64}/g, "");
    expect(withoutIdentifiers).not.toMatch(/(?<!\d)\d{12}(?!\d)/);
    expect(farmer.aadhaarLast4).toBe(number.slice(-4));
    expect(farmer.aadhaarHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects a bad Aadhaar checksum and a duplicate Aadhaar", async () => {
    const number = aadhaar();
    const bad = number.slice(0, 11) + ((Number(number[11]) + 1) % 10);
    const first = await farmerSession(false);
    const response = await as(first.token)
      .post("/farmers/me")
      .send(profile({ aadhaarNumber: bad }))
      .expect(422);
    expect(response.body.errors[0].field).toBe("aadhaarNumber");
    await as(first.token)
      .post("/farmers/me")
      .send(profile({ aadhaarNumber: number }))
      .expect(201);
    const second = await farmerSession(false);
    const dup = await as(second.token)
      .post("/farmers/me")
      .send(profile({ aadhaarNumber: number }))
      .expect(409);
    expect(dup.body.code).toBe("AADHAAR_TAKEN");
    expect(dup.body.errors[0].field).toBe("aadhaarNumber");
    // a failed attempt must not leave a half-created profile behind
    expect(await database.farmer.count({ where: { userId: second.user.id } })).toBe(0);
  });
  it("validates mobile, location hierarchy and uniqueness of the mobile", async () => {
    const a = await farmerSession(false);
    await as(a.token)
      .post("/farmers/me")
      .send(profile({ mobile: "12345" }))
      .expect(422);
    const otherMandal = geo.district.mandals[1];
    const mismatch = await as(a.token)
      .post("/farmers/me")
      .send(profile({ mandalId: otherMandal.id }))
      .expect(422);
    expect(mismatch.body.errors[0].field).toBe("villageId");
    const shared = mobile();
    await as(a.token)
      .post("/farmers/me")
      .send(profile({ mobile: shared }))
      .expect(201);
    const b = await farmerSession(false);
    const clash = await as(b.token)
      .post("/farmers/me")
      .send(profile({ mobile: shared }))
      .expect(409);
    expect(clash.body.code).toBe("MOBILE_TAKEN");
  });
  it("updates fields, changes the Aadhaar and clears it with null", async () => {
    const { token } = await farmerSession(false);
    await as(token)
      .post("/farmers/me")
      .send(profile({ aadhaarNumber: aadhaar() }))
      .expect(201);
    const patched = await as(token)
      .patch("/farmers/me")
      .send({ fullName: "Ravi K", notifications: { push: true } })
      .expect(200);
    expect(patched.body.data.fullName).toBe("Ravi K");
    expect(patched.body.data.notifications).toEqual({ sms: true, inApp: true, push: true });
    const cleared = await as(token).patch("/farmers/me").send({ aadhaarNumber: null }).expect(200);
    expect(cleared.body.data.aadhaar.masked).toBeNull();
    await as(token).patch("/farmers/me").send({ districtId: geo.otherDistrict.id }).expect(422);
    await as(token).patch("/farmers/me").send({}).expect(422);
    await as(token).patch("/farmers/me").send({ status: "INACTIVE" }).expect(422);
  });
  it("requires a profile before plots and is closed to other roles", async () => {
    const { token } = await farmerSession(false);
    expect((await as(token).get("/farmers/me").expect(409)).body.code).toBe("PROFILE_REQUIRED");
    expect((await as(token).post("/farmers/me/plots").send(plot()).expect(409)).body.code).toBe(
      "PROFILE_REQUIRED",
    );
    const officer = await provisionOfficer("STATE");
    const { token: officerToken } = await signIn(officer.username);
    await as(officerToken).get("/farmers/me").expect(403);
  });
});

describe("plots", () => {
  it("creates, reads, updates (crops replaced) and soft-deletes a plot", async () => {
    const { token } = await farmerSession();
    const created = await as(token).post("/farmers/me/plots").send(plot()).expect(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ extentAcres: "2.50", latitude: "17.385000" });
    expect(created.body.data.crops).toHaveLength(1);
    const maize = (await database.crop.findFirstOrThrow({ where: { code: "MAIZE" } })).id;
    const updated = await as(token)
      .patch("/farmers/me/plots/" + id)
      .send({ extentAcres: 3, crops: [{ cropId: maize, season: "RABI", year }] })
      .expect(200);
    expect(updated.body.data.extentAcres).toBe("3.00");
    expect(updated.body.data.crops).toEqual([
      expect.objectContaining({ season: "RABI", crop: expect.objectContaining({ code: "MAIZE" }) }),
    ]);
    expect((await as(token).get("/farmers/me/plots")).body.data).toHaveLength(1);
    await as(token)
      .delete("/farmers/me/plots/" + id)
      .expect(200);
    expect((await as(token).get("/farmers/me/plots")).body.data).toHaveLength(0);
    await as(token)
      .get("/farmers/me/plots/" + id)
      .expect(404);
    expect(await database.farmerPlot.count({ where: { id, isActive: false } })).toBe(1);
  });
  it("hides another farmer's plot with 404 for every verb", async () => {
    const owner = await farmerSession();
    const other = await farmerSession();
    const id = (await as(owner.token).post("/farmers/me/plots").send(plot()).expect(201)).body.data
      .id;
    await as(other.token)
      .get("/farmers/me/plots/" + id)
      .expect(404);
    await as(other.token)
      .patch("/farmers/me/plots/" + id)
      .send({ surveyNo: "x" })
      .expect(404);
    await as(other.token)
      .delete("/farmers/me/plots/" + id)
      .expect(404);
    expect(
      (
        await as(owner.token)
          .get("/farmers/me/plots/" + id)
          .expect(200)
      ).body.data.surveyNo,
    ).toBe("12/A");
  });
  it("validates extent, coordinates, polygons, crops and the 50-plot limit", async () => {
    const { user, token } = await farmerSession();
    for (const bad of [
      { extentAcres: 0 },
      { extentAcres: 1001 },
      { extentAcres: 1.234 },
      { latitude: 5 },
      { longitude: 99 },
      { surveyNo: "" },
      { crops: Array.from({ length: 11 }, (_, i) => ({ cropId, season: "RABI", year: 2000 + i })) },
      {
        crops: [
          { cropId, season: "RABI", year },
          { cropId, season: "RABI", year },
        ],
      },
      { crops: [{ cropId: "0b0c0d0e-0000-4000-8000-000000000000", season: "RABI", year }] },
      { villageId: "0b0c0d0e-0000-4000-8000-000000000000" },
      {
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [78, 17],
              [78.1, 17],
              [78.1, 17.1],
              [78.2, 17.2],
            ],
          ],
        },
      },
    ])
      await as(token).post("/farmers/me/plots").send(plot(bad)).expect(422);
    const ring = [
      [78, 17],
      [78.1, 17],
      [78.1, 17.1],
      [78, 17],
    ];
    const ok = await as(token)
      .post("/farmers/me/plots")
      .send(plot({ boundary: { type: "Polygon", coordinates: [ring] } }))
      .expect(201);
    expect(ok.body.data.boundary.type).toBe("Polygon");
    const farmer = await database.farmer.findUniqueOrThrow({ where: { userId: user.id } });
    await database.farmerPlot.createMany({
      data: Array.from({ length: 49 }, (_, i) => ({
        farmerId: farmer.id,
        surveyNo: "bulk-" + i,
        extentAcres: 1,
        villageId: village().id,
        latitude: 17,
        longitude: 78,
      })),
    });
    expect((await as(token).post("/farmers/me/plots").send(plot()).expect(422)).body.code).toBe(
      "PLOT_LIMIT",
    );
  });
});

describe("assisted registration", () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    account: { username: uniqueName("asst"), temporaryPassword: "temporary passphrase 1" },
    profile: profile(),
    consent: { farmerConsented: true, acceptTerms: true, acceptPrivacyPolicy: true },
    ...overrides,
  });
  async function agentSession(
    districtId = geo.district.id,
    role: "FIELD_AGENT" | "HELPDESK" = "FIELD_AGENT",
  ) {
    const agent = await provisionOfficer("DISTRICT", districtId, role);
    return { agent, token: (await signIn(agent.username)).token };
  }
  it("registers a farmer inside the agent's district with consent, provenance and plots", async () => {
    const { agent, token } = await agentSession();
    const input = body({ plots: [plot()] });
    const response = await as(token).post("/assisted/farmers").send(input).expect(201);
    expect(response.body.data).toMatchObject({
      username: input.account.username,
      assisted: true,
      plotCount: 1,
    });
    expect(JSON.stringify(response.body)).not.toContain("temporary passphrase");
    const farmer = await database.farmer.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { user: { include: { consents: true, roles: { include: { role: true } } } } },
    });
    expect(farmer.registeredByUserId).toBe(agent.id);
    expect(farmer.user).toMatchObject({ mustChangePassword: true, createdById: agent.id });
    expect(farmer.user.roles.map((r) => r.role.code)).toEqual(["FARMER"]);
    expect(farmer.user.consents).toHaveLength(2);
    for (const consent of farmer.user.consents) {
      expect(consent.capturedById).toBe(agent.id);
      expect(consent.purposes).toEqual(["ACCOUNT", "SERVICE_DELIVERY", "NOTIFICATIONS"]);
      expect(consent.language).toBe("te");
    }
    const audits = await database.auditLog.findMany({ where: { actorUserId: agent.id } });
    expect(audits.map((a) => a.action)).toContain("FARMER_ASSISTED_REGISTERED");
    expect(JSON.stringify(audits)).not.toContain("temporary passphrase");
  });
  it("forces the new farmer to change the temporary password on first login", async () => {
    const { token } = await agentSession();
    const input = body();
    await as(token).post("/assisted/farmers").send(input).expect(201);
    const farmer = await signIn(input.account.username, input.account.temporaryPassword);
    expect(farmer.response.status).toBe(200);
    expect((await as(farmer.token).get("/farmers/me").expect(403)).body.code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
    const next = "my own new passphrase";
    await as(farmer.token)
      .patch("/auth/change-password")
      .send({
        currentPassword: input.account.temporaryPassword,
        newPassword: next,
        confirmPassword: next,
      })
      .expect(200);
    const again = await signIn(input.account.username, next);
    await as(again.token).get("/farmers/me").expect(200);
  });
  it("refuses locations outside the agent's jurisdiction and missing consent", async () => {
    const { token } = await agentSession();
    const otherMandal = geo.otherDistrict.id;
    const away = await database.mandal.findFirstOrThrow({
      where: { districtId: otherMandal },
      include: { villages: true },
    });
    const outside = body({
      profile: profile({
        districtId: otherMandal,
        mandalId: away.id,
        villageId: away.villages[0].id,
      }),
    });
    expect((await as(token).post("/assisted/farmers").send(outside).expect(403)).body.code).toBe(
      "OUT_OF_JURISDICTION",
    );
    expect(await database.user.count({ where: { username: outside.account.username } })).toBe(0);
    await as(token)
      .post("/assisted/farmers")
      .send(
        body({ consent: { farmerConsented: false, acceptTerms: true, acceptPrivacyPolicy: true } }),
      )
      .expect(422);
    await as(token)
      .post("/assisted/farmers")
      .send({ ...body(), consent: undefined })
      .expect(422);
  });
  it("rolls everything back when a later step fails", async () => {
    const { token } = await agentSession();
    const input = body({
      plots: [
        plot({ crops: [{ cropId: "0b0c0d0e-0000-4000-8000-000000000000", season: "RABI", year }] }),
      ],
    });
    await as(token).post("/assisted/farmers").send(input).expect(422);
    expect(await database.user.count({ where: { username: input.account.username } })).toBe(0);
    const taken = await provisionFarmer();
    const dup = body({
      account: { username: taken.username, temporaryPassword: "temporary passphrase 1" },
    });
    expect((await as(token).post("/assisted/farmers").send(dup).expect(409)).body.code).toBe(
      "USERNAME_TAKEN",
    );
  });
  it("shows an agent only their own registrations", async () => {
    const mine = await agentSession();
    const theirs = await agentSession();
    const a = (await as(mine.token).post("/assisted/farmers").send(body()).expect(201)).body.data
      .id;
    const b = (await as(theirs.token).post("/assisted/farmers").send(body()).expect(201)).body.data
      .id;
    const list = await as(mine.token).get("/assisted/farmers").expect(200);
    expect(list.body.data.items.map((f: { id: string }) => f.id)).toEqual([a]);
    await as(mine.token)
      .get("/assisted/farmers/" + a)
      .expect(200);
    await as(mine.token)
      .get("/assisted/farmers/" + b)
      .expect(404);
    await as(mine.token).post(`/assisted/farmers/${b}/plots`).send(plot()).expect(404);
    await as(mine.token).post(`/assisted/farmers/${a}/plots`).send(plot()).expect(201);
    const detail = await as(mine.token)
      .get("/assisted/farmers/" + a)
      .expect(200);
    expect(detail.body.data.plots).toHaveLength(1);
  });
  it("is limited to roles with farmer.register_assisted", async () => {
    const officer = await provisionOfficer("DISTRICT", geo.district.id);
    const { token } = await signIn(officer.username);
    await as(token).post("/assisted/farmers").send(body()).expect(403);
    const farmer = await farmerSession(false);
    await as(farmer.token).get("/assisted/farmers").expect(403);
  });
});

describe("officer views", () => {
  it("scopes by jurisdiction, restricts field agents, masks helpdesk mobiles", async () => {
    const own = await provisionOfficer("DISTRICT", geo.district.id);
    const stranger = await provisionOfficer("DISTRICT", geo.otherDistrict.id);
    const state = await provisionOfficer("STATE");
    const agent = await provisionOfficer("DISTRICT", geo.district.id, "FIELD_AGENT");
    const desk = await provisionOfficer("DISTRICT", geo.district.id, "HELPDESK");
    const tokens = {
      own: (await signIn(own.username)).token,
      stranger: (await signIn(stranger.username)).token,
      state: (await signIn(state.username)).token,
      agent: (await signIn(agent.username)).token,
      desk: (await signIn(desk.username)).token,
    };
    const self = await farmerSession();
    const selfId = (await as(self.token).get("/farmers/me")).body.data.id;
    const assistedMobile = mobile();
    const assisted = (
      await as(tokens.agent)
        .post("/assisted/farmers")
        .send({
          account: { username: uniqueName("asst"), temporaryPassword: "temporary passphrase 1" },
          profile: profile({ mobile: assistedMobile }),
          consent: { farmerConsented: true, acceptTerms: true, acceptPrivacyPolicy: true },
        })
        .expect(201)
    ).body.data.id;
    const ids = async (token: string, qs = "") =>
      (
        (
          await as(token)
            .get("/admin/farmers" + qs)
            .expect(200)
        ).body.data.items as { id: string }[]
      ).map((f) => f.id);
    expect(await ids(tokens.own)).toEqual(expect.arrayContaining([selfId, assisted]));
    expect(await ids(tokens.state)).toEqual(expect.arrayContaining([selfId, assisted]));
    expect(await ids(tokens.stranger)).not.toContain(selfId);
    expect(await ids(tokens.own, "?assisted=true")).toContain(assisted);
    expect(await ids(tokens.own, "?assisted=true")).not.toContain(selfId);
    expect(await ids(tokens.own, "?assisted=false")).not.toContain(assisted);
    // field agent: own registrations only
    const agentIds = await ids(tokens.agent);
    expect(agentIds).toContain(assisted);
    expect(agentIds).not.toContain(selfId);
    await as(tokens.agent)
      .get("/admin/farmers/" + selfId)
      .expect(404);
    await as(tokens.stranger)
      .get("/admin/farmers/" + selfId)
      .expect(404);
    await as(tokens.own)
      .get("/admin/farmers/" + selfId)
      .expect(200);
    // helpdesk sees a masked mobile, officers the real one
    const masked = await as(tokens.desk)
      .get("/admin/farmers/" + assisted)
      .expect(200);
    expect(masked.body.data.mobile).toBe(
      assistedMobile.slice(0, 2) + "XXXXXX" + assistedMobile.slice(-2),
    );
    expect((await as(tokens.own).get("/admin/farmers/" + assisted)).body.data.mobile).toBe(
      assistedMobile,
    );
    expect(JSON.stringify((await as(tokens.desk).get("/admin/farmers")).body)).not.toContain(
      assistedMobile,
    );
    // farmers themselves cannot use the officer views
    await as(self.token).get("/admin/farmers").expect(403);
    expect(testPassword).toBeTruthy();
  });
  it("lists nothing for a department user without a jurisdiction row", async () => {
    const user = await database.user.findFirstOrThrow({
      where: { username: { startsWith: "t3_" } },
    });
    void user;
    const orphan = await provisionOfficer("STATE");
    await database.userJurisdiction.delete({ where: { userId: orphan.id } });
    const { token } = await signIn(orphan.username);
    await farmerSession();
    expect((await as(token).get("/admin/farmers").expect(200)).body.data.total).toBe(0);
  });
});
