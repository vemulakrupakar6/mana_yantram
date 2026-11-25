import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionOfficer,
  signIn,
} from "../../../tests/factories.js";
import {
  completeApplication,
  providerSession,
  replaceDocument,
  setStatus,
  type ProviderSession,
} from "../../../tests/provider-setup.js";

beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

async function officers(s: ProviderSession) {
  const make = async (
    role: Parameters<typeof provisionOfficer>[2],
    districtId = s.geo.district.id,
    level: "DISTRICT" | "STATE" | "MANDAL" = "DISTRICT",
  ) => {
    const user = await provisionOfficer(
      level,
      level === "STATE" ? undefined : districtId,
      role,
      level === "MANDAL" ? s.geo.mandal.id : undefined,
    );
    return { user, token: (await signIn(user.username)).token };
  };
  return {
    district: await make("DISTRICT_OFFICER"),
    state: await make("STATE_ADMIN", undefined, "STATE"),
    far: await make("DISTRICT_OFFICER", s.geo.otherDistrict.id),
    mandal: await make("MANDAL_OFFICER", s.geo.district.id, "MANDAL"),
    helpdesk: await make("HELPDESK"),
    agent: await make("FIELD_AGENT"),
  };
}
async function submitted() {
  const s = await providerSession();
  await completeApplication(s);
  await as(s.token).post("/providers/me/submit").expect(200);
  return { s, o: await officers(s) };
}
const documents = async (s: ProviderSession) =>
  (await as(s.token).get("/providers/me/documents")).body.data as {
    document?: { id: string; status: string };
  }[];
const acceptAll = async (s: ProviderSession, officer: string) => {
  const detail = (await as(officer).get("/admin/providers/" + s.id)).body.data;
  for (const d of detail.documents)
    await as(officer)
      .post(`/admin/providers/${s.id}/documents/${d.document.id}/review`)
      .send({ decision: "ACCEPT" })
      .expect(200);
  await as(officer)
    .post(`/admin/providers/${s.id}/bank-account/review`)
    .send({ decision: "ACCEPT" })
    .expect(200);
};

describe("submission", () => {
  it("lists the missing checklist items when the application is incomplete", async () => {
    const s = await providerSession();
    const response = await as(s.token).post("/providers/me/submit").expect(422);
    expect(response.body.code).toBe("APPLICATION_INCOMPLETE");
    expect(response.body.errors.map((e: { field: string }) => e.field)).toEqual([
      "bankAccount",
      "documents",
      "equipment",
      "coverage",
      "workingHours",
    ]);
    expect((await database.provider.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
      "DRAFT",
    );
  });
  it("moves a complete DRAFT to SUBMITTED, records history and locks editing", async () => {
    const s = await providerSession();
    await completeApplication(s);
    const done = await as(s.token).post("/providers/me/submit").expect(200);
    expect(done.body.data.status).toBe("SUBMITTED");
    expect(done.body.data.submittedAt).toBeTruthy();
    const history = (await as(s.token).get("/providers/me/verification-history").expect(200)).body
      .data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: "SUBMIT",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actorRole: "PROVIDER",
    });
    expect(JSON.stringify(history)).not.toContain(s.user.username);
    expect(
      await database.auditLog.count({
        where: { actorUserId: s.user.id, action: "PROVIDER_SUBMIT" },
      }),
    ).toBe(1);
    expect(
      (await as(s.token).patch("/providers/me").send({ name: "Edited" }).expect(409)).body.code,
    ).toBe("INVALID_STATE");
    expect((await as(s.token).post("/providers/me/submit").expect(409)).body.code).toBe(
      "INVALID_STATE",
    );
  });
  it("cannot be submitted from the other states", async () => {
    const s = await providerSession();
    await completeApplication(s);
    for (const status of [
      "SUBMITTED",
      "APPROVED",
      "SUSPENDED",
      "REJECTED",
      "BLACKLISTED",
    ] as const) {
      await setStatus(s.id, status);
      expect((await as(s.token).post("/providers/me/submit").expect(409)).body.code).toBe(
        "INVALID_STATE",
      );
    }
  });
  it("lets only one of several simultaneous submissions through", async () => {
    const s = await providerSession();
    await completeApplication(s);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => as(s.token).post("/providers/me/submit")),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      await database.providerVerification.count({ where: { providerId: s.id, action: "SUBMIT" } }),
    ).toBe(1);
  });
});

describe("review queue", () => {
  it("is scoped by jurisdiction and permission", async () => {
    const { s, o } = await submitted();
    const ids = async (token: string, qs = "") =>
      (
        (
          await as(token)
            .get("/admin/providers" + qs)
            .expect(200)
        ).body.data.items as { id: string }[]
      ).map((p) => p.id);
    for (const who of [o.district, o.state, o.mandal, o.helpdesk])
      expect(await ids(who.token)).toContain(s.id);
    expect(await ids(o.far.token)).not.toContain(s.id);
    await as(o.agent.token).get("/admin/providers").expect(403);
    await as(s.token).get("/admin/providers").expect(403);
    const farmer = await provisionFarmer();
    await as((await signIn(farmer.username)).token)
      .get("/admin/providers")
      .expect(403);
    await as("bad").get("/admin/providers").expect(401);
  });
  it("filters, searches, counts pending items and sorts SUBMITTED oldest first", async () => {
    const a = await submitted();
    const b = await submitted();
    await database.provider.update({
      where: { id: b.s.id },
      data: {
        submittedAt: new Date(Date.now() - 3 * 86_400_000),
        type: "FPO",
        registrationNo: "REG-9",
      },
    });
    const token = a.o.state.token;
    const list = (await as(token).get("/admin/providers?status=SUBMITTED&pageSize=100").expect(200))
      .body.data;
    const order = list.items.map((p: { id: string }) => p.id);
    expect(order.indexOf(b.s.id)).toBeLessThan(order.indexOf(a.s.id)); // older first
    const row = list.items.find((p: { id: string }) => p.id === a.s.id);
    expect(row).toMatchObject({
      status: "SUBMITTED",
      pendingDocs: 4,
      district: { nameEn: "Sample District A" },
    }); // 3 documents + bank
    const search = async (q: string) =>
      (
        (
          await as(token)
            .get("/admin/providers?search=" + encodeURIComponent(q))
            .expect(200)
        ).body.data.items as { id: string }[]
      ).map((p) => p.id);
    expect(await search(row.providerNo)).toEqual([a.s.id]);
    expect(await search("sri rama")).toEqual(expect.arrayContaining([a.s.id, b.s.id]));
    expect(await search(row.mobile)).toContain(a.s.id);
    expect(await search("zzz-no-match")).toEqual([]);
    const fpo = (await as(token).get("/admin/providers?type=FPO&status=SUBMITTED").expect(200)).body
      .data.items as { id: string }[];
    expect(fpo.map((p) => p.id)).toEqual([b.s.id]);
    const window = await as(token)
      .get(
        `/admin/providers?submittedFrom=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&status=SUBMITTED`,
      )
      .expect(200);
    expect(window.body.data.items.map((p: { id: string }) => p.id)).not.toContain(b.s.id);
    const paged = (
      await as(token).get("/admin/providers?status=SUBMITTED&pageSize=1&page=2").expect(200)
    ).body.data;
    expect(paged).toMatchObject({ page: 2, pageSize: 1 });
    expect(paged.total).toBeGreaterThanOrEqual(2);
    await as(token).get("/admin/providers?pageSize=500").expect(422);
    await as(token).get("/admin/providers?status=NOPE").expect(422);
  });
  it("shows full detail inside jurisdiction and 404 outside, with the bank masked", async () => {
    const { s, o } = await submitted();
    const detail = await as(o.district.token)
      .get("/admin/providers/" + s.id)
      .expect(200);
    const d = detail.body.data;
    expect(d).toMatchObject({
      providerNo: expect.stringMatching(/^PRV/),
      status: "SUBMITTED",
      bankAccount: { accountNumber: "XXXXXX9012", status: "PENDING" },
    });
    expect(d.documents.map((x: { documentTypeCode: string }) => x.documentTypeCode).sort()).toEqual(
      ["BANK_PROOF", "ID_PROOF", "MACHINE_RC"],
    );
    expect(d.documents[0].document.file.url).toMatch(/^\/api\/v1\/files\//);
    expect(d.equipment).toHaveLength(1);
    expect(d.equipment[0]).toMatchObject({
      units: [{ unitLabel: "Unit 1" }, { unitLabel: "Unit 2" }],
      services: [{ ratePaise: 80000 }],
    });
    expect(d.coverage).toMatchObject({ mode: "RADIUS", radiusKm: 25 });
    expect(d.workingHours).toEqual([{ weekday: 1, start: "06:00", end: "18:00" }]);
    expect(d.history[0]).toMatchObject({ action: "SUBMIT", actorRole: "PROVIDER" });
    expect(JSON.stringify(detail.body)).not.toContain("123456789012");
    await as(o.far.token)
      .get("/admin/providers/" + s.id)
      .expect(404);
    await as(o.district.token).get("/admin/providers/not-a-uuid").expect(404);
  });
});

describe("document and bank review", () => {
  it("accepts or returns documents, requiring remarks to return", async () => {
    const { s, o } = await submitted();
    const docs = (await as(o.district.token).get("/admin/providers/" + s.id)).body.data
      .documents as { document: { id: string } }[];
    const url = (id: string) => `/admin/providers/${s.id}/documents/${id}/review`;
    await as(o.district.token)
      .post(url(docs[0].document.id))
      .send({ decision: "RETURN" })
      .expect(422);
    await as(o.district.token)
      .post(url(docs[0].document.id))
      .send({ decision: "RETURN", remarks: "ab" })
      .expect(422);
    const returned = await as(o.district.token)
      .post(url(docs[0].document.id))
      .send({ decision: "RETURN", remarks: "Image is blurry" })
      .expect(200);
    expect(returned.body.data.document).toMatchObject({
      status: "RETURNED",
      remarks: "Image is blurry",
    });
    const accepted = await as(o.district.token)
      .post(url(docs[0].document.id))
      .send({ decision: "ACCEPT", remarks: "ignored" })
      .expect(200);
    expect(accepted.body.data.document).toMatchObject({ status: "ACCEPTED", remarks: null });
    const row = await database.providerDocument.findUniqueOrThrow({
      where: { id: docs[0].document.id },
    });
    expect(row.reviewedById).toBe(o.district.user.id);
    expect(row.reviewedAt).not.toBeNull();
    await as(o.mandal.token)
      .post(url(docs[1].document.id))
      .send({ decision: "ACCEPT" })
      .expect(403);
    await as(o.helpdesk.token)
      .post(url(docs[1].document.id))
      .send({ decision: "ACCEPT" })
      .expect(403);
    await as(o.far.token).post(url(docs[1].document.id)).send({ decision: "ACCEPT" }).expect(404);
    await as(o.district.token)
      .post(url("0b0c0d0e-0000-4000-8000-000000000000"))
      .send({ decision: "ACCEPT" })
      .expect(404);
    await as(o.district.token)
      .post(url(docs[1].document.id))
      .send({ decision: "ACCEPT", extra: 1 })
      .expect(422);
  });
  it("reviews only while SUBMITTED, except equipment documents after approval", async () => {
    const { s, o } = await submitted();
    const detail = (await as(o.district.token).get("/admin/providers/" + s.id)).body.data;
    const idDoc = detail.documents.find(
      (d: { documentTypeCode: string }) => d.documentTypeCode === "ID_PROOF",
    ).document.id;
    const rc = detail.documents.find(
      (d: { documentTypeCode: string }) => d.documentTypeCode === "MACHINE_RC",
    ).document.id;
    const review = (id: string) =>
      as(o.district.token)
        .post(`/admin/providers/${s.id}/documents/${id}/review`)
        .send({ decision: "ACCEPT" });
    for (const status of ["DRAFT", "RETURNED"] as const) {
      await setStatus(s.id, status);
      expect((await review(idDoc).expect(409)).body.code).toBe("INVALID_STATE");
    }
    for (const status of ["APPROVED", "SUSPENDED"] as const) {
      await setStatus(s.id, status);
      await review(idDoc).expect(409);
      await review(rc).expect(200);
    }
    await setStatus(s.id, "REJECTED");
    await review(rc).expect(409);
  });
  it("reviews the bank account only while SUBMITTED", async () => {
    const { s, o } = await submitted();
    const url = `/admin/providers/${s.id}/bank-account/review`;
    const returned = await as(o.district.token)
      .post(url)
      .send({ decision: "RETURN", remarks: "IFSC does not match proof" })
      .expect(200);
    expect(returned.body.data).toMatchObject({
      status: "RETURNED",
      remarks: "IFSC does not match proof",
    });
    await as(o.district.token).post(url).send({ decision: "RETURN" }).expect(422);
    await as(o.district.token).post(url).send({ decision: "ACCEPT" }).expect(200);
    await setStatus(s.id, "APPROVED");
    await as(o.district.token).post(url).send({ decision: "ACCEPT" }).expect(409);
  });
  it("reveals the full account number only to verifiers inside jurisdiction, with an audit row", async () => {
    const { s, o } = await submitted();
    const url = `/admin/providers/${s.id}/bank-account/reveal`;
    const shown = await as(o.district.token).get(url).expect(200);
    expect(shown.body.data).toEqual({
      holderName: "Rama Rao",
      accountNumber: "123456789012",
      ifsc: "SBIN0001234",
    });
    expect(shown.headers["cache-control"]).toBe("no-store");
    const audits = await database.auditLog.findMany({
      where: { action: "BANK_ACCOUNT_REVEALED", entityId: s.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorUserId).toBe(o.district.user.id);
    expect(JSON.stringify(audits)).not.toContain("123456789012");
    await as(o.far.token).get(url).expect(404);
    await as(o.mandal.token).get(url).expect(403);
    await as(o.helpdesk.token).get(url).expect(403);
    await as(s.token).get(url).expect(403);
    expect(
      await database.auditLog.count({ where: { action: "BANK_ACCOUNT_REVEALED", entityId: s.id } }),
    ).toBe(1);
  });
});

describe("approve, return and reject", () => {
  it("refuses approval until every document and the bank account are accepted", async () => {
    const { s, o } = await submitted();
    const verify = (body: object) =>
      as(o.district.token).post(`/admin/providers/${s.id}/verify`).send(body);
    const blocked = await verify({ action: "APPROVE" }).expect(422);
    expect(blocked.body.code).toBe("APPLICATION_INCOMPLETE");
    expect(
      blocked.body.errors.filter((e: { field: string }) => e.field === "documents"),
    ).toHaveLength(3);
    expect(blocked.body.errors.map((e: { field: string }) => e.field)).toContain("bankAccount");
    await acceptAll(s, o.district.token);
    const rc = (
      await as(o.district.token).get("/admin/providers/" + s.id)
    ).body.data.documents.find(
      (d: { documentTypeCode: string }) => d.documentTypeCode === "MACHINE_RC",
    );
    await as(o.district.token)
      .post(`/admin/providers/${s.id}/documents/${rc.document.id}/review`)
      .send({ decision: "RETURN", remarks: "Unreadable" })
      .expect(200);
    expect((await verify({ action: "APPROVE" }).expect(422)).body.errors).toHaveLength(1);
    await as(o.district.token)
      .post(`/admin/providers/${s.id}/documents/${rc.document.id}/review`)
      .send({ decision: "ACCEPT" })
      .expect(200);
    const approved = await verify({ action: "APPROVE", remarks: "All good" }).expect(200);
    expect(approved.body.data.status).toBe("APPROVED");
    const row = await database.provider.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.approvedById).toBe(o.district.user.id);
    expect(row.approvedAt).not.toBeNull();
    expect(approved.body.data.history[0]).toMatchObject({
      action: "APPROVE",
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
      remarks: "All good",
      actorRole: "DISTRICT_OFFICER",
    });
    expect((await verify({ action: "APPROVE" }).expect(409)).body.code).toBe("INVALID_STATE");
  });
  it("runs the full return, fix, resubmit and approve flow", async () => {
    const { s, o } = await submitted();
    const verify = (token: string, body: object) =>
      as(token).post(`/admin/providers/${s.id}/verify`).send(body);
    await verify(o.district.token, { action: "RETURN" }).expect(422); // nothing to say
    const detail = (await as(o.district.token).get("/admin/providers/" + s.id)).body.data;
    const idDoc = detail.documents.find(
      (d: { documentTypeCode: string }) => d.documentTypeCode === "ID_PROOF",
    ).document.id;
    await as(o.district.token)
      .post(`/admin/providers/${s.id}/documents/${idDoc}/review`)
      .send({ decision: "RETURN", remarks: "Blurry ID" })
      .expect(200);
    const tractor = detail.equipment[0].id;
    const returned = await verify(o.district.token, {
      action: "RETURN",
      remarks: "Please fix the items below",
      fieldRemarks: {
        name: "Use your registered business name",
        equipment: { [tractor]: "Photo does not show the machine" },
      },
    }).expect(200);
    expect(returned.body.data.status).toBe("RETURNED");
    // the provider sees the remarks and the returned document
    const me = (await as(s.token).get("/providers/me").expect(200)).body.data;
    expect(me.latestReturn).toMatchObject({
      remarks: "Please fix the items below",
      fieldRemarks: {
        name: "Use your registered business name",
        equipment: { [tractor]: "Photo does not show the machine" },
      },
    });
    const docs = (await as(s.token).get("/providers/me/documents")).body.data as {
      documentTypeCode: string;
      document: { status: string; remarks: string };
    }[];
    expect(docs.find((d) => d.documentTypeCode === "ID_PROOF")!.document).toMatchObject({
      status: "RETURNED",
      remarks: "Blurry ID",
    });
    // resubmitting is blocked until the returned document is replaced
    const blocked = await as(s.token).post("/providers/me/submit").expect(422);
    expect(blocked.body.errors.map((e: { field: string }) => e.field)).toEqual(["documents"]);
    await as(s.token).patch("/providers/me").send({ name: "Sri Rama Agro Services" }).expect(200); // RETURNED is editable
    await replaceDocument(s, "ID_PROOF").then((r) => expect(r.status).toBe(200));
    const again = await as(s.token).post("/providers/me/submit").expect(200);
    expect(again.body.data.status).toBe("SUBMITTED");
    expect(again.body.data.latestReturn).toBeNull();
    // the officer accepts everything and approves; the provider sees APPROVED
    await acceptAll(s, o.district.token);
    await verify(o.district.token, { action: "APPROVE" }).expect(200);
    expect((await as(s.token).get("/providers/me").expect(200)).body.data.status).toBe("APPROVED");
    const history = (await as(s.token).get("/providers/me/verification-history")).body.data as {
      action: string;
      actorRole: string;
    }[];
    expect(history.map((h) => h.action)).toEqual(["APPROVE", "SUBMIT", "RETURN", "SUBMIT"]);
    expect(history.map((h) => h.actorRole)).toEqual([
      "DISTRICT_OFFICER",
      "PROVIDER",
      "DISTRICT_OFFICER",
      "PROVIDER",
    ]);
  });
  it("accepts a return that has only a returned document or only the bank returned", async () => {
    const { s, o } = await submitted();
    await as(o.district.token)
      .post(`/admin/providers/${s.id}/bank-account/review`)
      .send({ decision: "RETURN", remarks: "Wrong IFSC" })
      .expect(200);
    const response = await as(o.district.token)
      .post(`/admin/providers/${s.id}/verify`)
      .send({ action: "RETURN" })
      .expect(200);
    expect(response.body.data.status).toBe("RETURNED");
  });
  it("rejects with remarks, after which the application is terminal", async () => {
    const { s, o } = await submitted();
    const verify = (body: object) =>
      as(o.district.token).post(`/admin/providers/${s.id}/verify`).send(body);
    await verify({ action: "REJECT" }).expect(422);
    const rejected = await verify({ action: "REJECT", remarks: "Not an eligible provider" }).expect(
      200,
    );
    expect(rejected.body.data.status).toBe("REJECTED");
    for (const action of ["APPROVE", "RETURN", "REJECT"])
      expect((await verify({ action, remarks: "again" }).expect(409)).body.code).toBe(
        "INVALID_STATE",
      );
    await as(s.token).patch("/providers/me").send({ name: "Another name" }).expect(409);
    await as(s.token).post("/providers/me/submit").expect(409);
    const me = await as(s.token).get("/providers/me").expect(200);
    expect(me.body.data).toMatchObject({
      status: "REJECTED",
      editable: { profile: false, equipment: false, coverage: false, operators: false },
    });
  });
  it("validates the request and enforces permissions and jurisdiction", async () => {
    const { s, o } = await submitted();
    const url = `/admin/providers/${s.id}/verify`;
    for (const bad of [
      { action: "APPROVE", extra: 1 },
      { action: "DESTROY" },
      { action: "RETURN", fieldRemarks: { unknownField: "text here" } },
      { action: "RETURN", fieldRemarks: { name: "ab" } },
      { action: "RETURN", fieldRemarks: { equipment: { "not-a-uuid": "some remark" } } },
      { action: "REJECT", remarks: "ab" },
      {},
    ])
      await as(o.district.token).post(url).send(bad).expect(422);
    await as(o.mandal.token)
      .post(url)
      .send({ action: "REJECT", remarks: "no permission" })
      .expect(403);
    await as(o.helpdesk.token)
      .post(url)
      .send({ action: "REJECT", remarks: "no permission" })
      .expect(403);
    await as(o.far.token)
      .post(url)
      .send({ action: "REJECT", remarks: "wrong district" })
      .expect(404);
    await as(s.token)
      .post(url)
      .send({ action: "REJECT", remarks: "I am the provider" })
      .expect(403);
    await as("bad").post(url).send({ action: "REJECT", remarks: "no token" }).expect(401);
    expect((await database.provider.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
      "SUBMITTED",
    );
  });
  it("lets exactly one of two simultaneous decisions win", async () => {
    const { s, o } = await submitted();
    await acceptAll(s, o.district.token);
    const url = `/admin/providers/${s.id}/verify`;
    const results = await Promise.all([
      as(o.district.token).post(url).send({ action: "APPROVE" }),
      as(o.state.token).post(url).send({ action: "REJECT", remarks: "Conflicting decision" }),
      as(o.district.token).post(url).send({ action: "APPROVE" }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(
      await database.providerVerification.count({
        where: { providerId: s.id, action: { in: ["APPROVE", "REJECT"] } },
      }),
    ).toBe(1);
  });
});

describe("suspend, blacklist and reinstate", () => {
  it("follows the state machine and records each step", async () => {
    const { s, o } = await submitted();
    const act = (what: string, token: string, body: object = { remarks: "Complaints received" }) =>
      as(token).post(`/admin/providers/${s.id}/${what}`).send(body);
    for (const what of ["suspend", "blacklist", "reinstate"])
      expect((await act(what, o.district.token).expect(409)).body.code).toBe("INVALID_STATE"); // still SUBMITTED
    await acceptAll(s, o.district.token);
    await as(o.district.token)
      .post(`/admin/providers/${s.id}/verify`)
      .send({ action: "APPROVE" })
      .expect(200);
    await act("reinstate", o.district.token, {}).expect(409); // only SUSPENDED can be reinstated
    await act("suspend", o.district.token, {}).expect(422); // remarks required
    expect((await act("suspend", o.district.token).expect(200)).body.data.status).toBe("SUSPENDED");
    await act("suspend", o.district.token).expect(409);
    expect((await act("reinstate", o.state.token, {}).expect(200)).body.data.status).toBe(
      "APPROVED",
    );
    await act("suspend", o.district.token).expect(200);
    expect(
      (await act("blacklist", o.district.token, { remarks: "Fraud confirmed" }).expect(200)).body
        .data.status,
    ).toBe("BLACKLISTED");
    for (const what of ["suspend", "blacklist", "reinstate"])
      await act(what, o.district.token).expect(409); // terminal
    const history = (await as(s.token).get("/providers/me/verification-history")).body.data as {
      action: string;
    }[];
    expect(history.map((h) => h.action)).toEqual([
      "BLACKLIST",
      "SUSPEND",
      "REINSTATE",
      "SUSPEND",
      "APPROVE",
      "SUBMIT",
    ]);
    expect(
      await database.auditLog.count({ where: { entityId: s.id, action: "PROVIDER_BLACKLIST" } }),
    ).toBe(1);
  });
  it("can blacklist straight from APPROVED and respects permissions", async () => {
    const { s, o } = await submitted();
    await setStatus(s.id, "APPROVED");
    const url = `/admin/providers/${s.id}/blacklist`;
    await as(o.mandal.token).post(url).send({ remarks: "No permission" }).expect(403);
    await as(o.helpdesk.token).post(url).send({ remarks: "No permission" }).expect(403);
    await as(o.far.token).post(url).send({ remarks: "Other district" }).expect(404);
    await as(o.district.token).post(url).send({ remarks: "Serious violation" }).expect(200);
    expect((await as(s.token).get("/providers/me")).body.data.status).toBe("BLACKLISTED");
  });
  it("still lets a suspended provider manage equipment, hours and operators but not the profile", async () => {
    const { s } = await submitted();
    await setStatus(s.id, "SUSPENDED");
    await as(s.token)
      .put("/providers/me/coverage")
      .send({ mode: "RADIUS", radiusKm: 30 })
      .expect(200);
    await as(s.token).patch("/providers/me").send({ name: "Another name" }).expect(409);
    expect((await documents(s)).length).toBeGreaterThan(0);
  });
});
