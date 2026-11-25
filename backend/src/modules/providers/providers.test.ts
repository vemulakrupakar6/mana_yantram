import { randomInt } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database } from "../../config/database.js";
import { decryptField } from "../../utils/field-crypto.js";
import {
  as,
  cleanupFactories,
  clearLoginLimits,
  provisionFarmer,
  provisionOfficer,
  provisionProvider,
  sampleGeo,
  signIn,
  uniqueName,
} from "../../../tests/factories.js";
import { listableProviderWhere } from "./providers.repository.js";

type Geo = Awaited<ReturnType<typeof sampleGeo>>;
let geo: Geo;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
const mobile = () => "9" + String(randomInt(0, 1e9)).padStart(9, "0");

beforeAll(async () => {
  geo = await sampleGeo();
});
beforeEach(clearLoginLimits);
afterAll(cleanupFactories);

const profile = (overrides: Record<string, unknown> = {}) => ({
  type: "INDIVIDUAL",
  name: "Sri Rama Agro Services",
  contactPerson: "Rama Rao",
  mobile: mobile(),
  addressLine: "Main road, near bus stand",
  districtId: geo.district.id,
  mandalId: geo.mandal.id,
  villageId: geo.mandal.villages[0].id,
  baseLatitude: 17.385,
  baseLongitude: 78.4867,
  ...overrides,
});
async function providerSession(withProfile = true, overrides: Record<string, unknown> = {}) {
  const user = await provisionProvider();
  const { token } = await signIn(user.username);
  let id = "";
  if (withProfile) {
    id = (await as(token).post("/providers/me").send(profile(overrides)).expect(201)).body.data.id;
  }
  return { user, token, id };
}
async function upload(token: string, purpose = "DOCUMENT") {
  return (
    await as(token)
      .post("/files")
      .field("purpose", purpose)
      .attach("file", png, "doc.png")
      .expect(201)
  ).body.data.id as string;
}
async function addEquipment(
  providerId: string,
  categoryCode: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
) {
  const category = await database.serviceCategory.findUniqueOrThrow({
    where: { code: categoryCode },
  });
  return database.equipment.create({
    data: {
      providerId,
      categoryId: category.id,
      make: "Mahindra",
      model: "575",
      year: 2020,
      status,
    },
  });
}
const setStatus = (
  id: string,
  status: "SUBMITTED" | "RETURNED" | "APPROVED" | "SUSPENDED" | "REJECTED",
) => database.provider.update({ where: { id }, data: { status } });

describe("provider profile", () => {
  it("creates a DRAFT with a provider number, completes onboarding and rejects a second", async () => {
    const { user, token } = await providerSession(false);
    const created = await as(token).post("/providers/me").send(profile()).expect(201);
    expect(created.body.data).toMatchObject({
      status: "DRAFT",
      type: "INDIVIDUAL",
      district: { nameEn: "Sample District A" },
      counts: { equipment: 0, units: 0, operators: 0 },
      editable: { profile: true, equipment: true, coverage: true, operators: true },
      bankAccount: null,
    });
    expect(created.body.data.providerNo).toMatch(/^PRV\d{2}\d{6}$/);
    expect(created.body.data.baseLatitude).toBe("17.385000");
    expect((await as(token).get("/auth/me")).body.data.onboarding.PROVIDER).toBe("COMPLETED");
    expect((await as(token).post("/providers/me").send(profile()).expect(409)).body.code).toBe(
      "PROFILE_EXISTS",
    );
    expect(
      await database.auditLog.count({
        where: { actorUserId: user.id, action: "PROVIDER_PROFILE_CREATED" },
      }),
    ).toBe(1);
  });
  it("issues unique, increasing provider numbers", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const no = async (token: string) =>
      (await as(token).get("/providers/me")).body.data.providerNo as string;
    const [x, y] = [await no(a.token), await no(b.token)];
    expect(x).not.toBe(y);
    expect(Number(y.slice(3))).toBeGreaterThan(Number(x.slice(3)));
  });
  it("requires a registration number unless the provider is an individual", async () => {
    const { token } = await providerSession(false);
    const fpo = await as(token)
      .post("/providers/me")
      .send(profile({ type: "FPO" }))
      .expect(422);
    expect(fpo.body.errors.map((e: { field: string }) => e.field)).toContain("registrationNo");
    await as(token)
      .post("/providers/me")
      .send(profile({ type: "FPO", registrationNo: "REG-2020-001" }))
      .expect(201);
  });
  it("validates GSTIN, pincode, coordinates, mobile and hierarchy; uppercases the GSTIN", async () => {
    const { token } = await providerSession(false);
    for (const bad of [
      { gstin: "NOTAGSTIN" },
      { pincode: "012345" },
      { baseLatitude: 5 },
      { baseLongitude: 99 },
      { mobile: "12345" },
      { name: "x" },
      { email: "not-an-email" },
      { type: "COMPANY" },
    ])
      await as(token).post("/providers/me").send(profile(bad)).expect(422);
    const mismatch = await as(token)
      .post("/providers/me")
      .send(profile({ mandalId: geo.district.mandals[1].id }))
      .expect(422);
    expect(mismatch.body.errors[0].field).toBe("villageId");
    const ok = await as(token)
      .post("/providers/me")
      .send(profile({ gstin: "36aabcu9603r1zx", pincode: "500001", email: "a@b.in" }))
      .expect(201);
    expect(ok.body.data.gstin).toBe("36AABCU9603R1ZX");
  });
  it("is closed to other roles", async () => {
    const farmer = await provisionFarmer();
    const { token } = await signIn(farmer.username);
    await as(token).post("/providers/me").send(profile()).expect(403);
    await as(token).get("/providers/me").expect(403);
  });
  it("updates in DRAFT and RETURNED, is locked otherwise", async () => {
    const { token, id } = await providerSession();
    const patched = await as(token)
      .patch("/providers/me")
      .send({ name: "New Name", gstin: null })
      .expect(200);
    expect(patched.body.data.name).toBe("New Name");
    await as(token).patch("/providers/me").send({ type: "CHC" }).expect(422); // needs registrationNo
    await as(token)
      .patch("/providers/me")
      .send({ type: "CHC", registrationNo: "CHC-77" })
      .expect(200);
    await as(token).patch("/providers/me").send({}).expect(422);
    await as(token).patch("/providers/me").send({ status: "APPROVED" }).expect(422);
    for (const status of ["SUBMITTED", "APPROVED", "SUSPENDED", "REJECTED"] as const) {
      await setStatus(id, status);
      const response = await as(token).patch("/providers/me").send({ name: "Blocked" }).expect(409);
      expect(response.body.code).toBe("INVALID_STATE");
    }
    await setStatus(id, "RETURNED");
    await as(token).patch("/providers/me").send({ name: "Fixed" }).expect(200);
  });
  it("shows the latest return remarks only while RETURNED", async () => {
    const { token, id, user } = await providerSession();
    await database.providerVerification.create({
      data: {
        providerId: id,
        action: "RETURN",
        fromStatus: "SUBMITTED",
        toStatus: "RETURNED",
        remarks: "Fix the GSTIN",
        fieldRemarks: { gstin: "Looks wrong" },
        actorId: user.id,
      },
    });
    expect((await as(token).get("/providers/me")).body.data.latestReturn).toBeNull();
    await setStatus(id, "RETURNED");
    const me = await as(token).get("/providers/me").expect(200);
    expect(me.body.data.latestReturn).toMatchObject({
      remarks: "Fix the GSTIN",
      fieldRemarks: { gstin: "Looks wrong" },
    });
  });
});

describe("required documents", () => {
  const codes = async (token: string) =>
    (
      (await as(token).get("/providers/me/documents").expect(200)).body.data as {
        documentTypeCode: string;
        equipmentId: string | null;
      }[]
    ).map((d) => d.documentTypeCode);
  it("starts with ID and bank proof, adding the registration certificate for non-individuals", async () => {
    const a = await providerSession();
    expect((await codes(a.token)).sort()).toEqual(["BANK_PROOF", "ID_PROOF"]);
    const b = await providerSession(true, { type: "FPO", registrationNo: "REG-1" });
    expect((await codes(b.token)).sort()).toEqual([
      "BANK_PROOF",
      "ID_PROOF",
      "REGISTRATION_CERTIFICATE",
    ]);
  });
  it("adds a pilot licence once for drones and one RC per active tractor", async () => {
    const { token, id } = await providerSession();
    await addEquipment(id, "DRONE");
    await addEquipment(id, "DRONE");
    expect((await codes(token)).filter((c) => c === "DRONE_PILOT_LICENCE")).toHaveLength(1);
    const t1 = await addEquipment(id, "TRACTOR");
    const t2 = await addEquipment(id, "TRACTOR");
    await addEquipment(id, "TRACTOR", "INACTIVE");
    await addEquipment(id, "ROTAVATOR");
    const list = (await as(token).get("/providers/me/documents").expect(200)).body.data as {
      documentTypeCode: string;
      equipmentId: string | null;
      equipmentLabel: string | null;
      required: boolean;
    }[];
    const rcs = list.filter((d) => d.documentTypeCode === "MACHINE_RC");
    expect(rcs.map((d) => d.equipmentId).sort()).toEqual([t1.id, t2.id].sort());
    expect(rcs[0].equipmentLabel).toContain("Mahindra 575");
    expect(list.every((d) => d.required)).toBe(true);
  });
});

describe("document upload", () => {
  const put = (token: string, body: Record<string, unknown>) =>
    as(token).put("/providers/me/documents").send(body);
  it("uploads, lists with file details, then replaces (old file soft-deleted, status reset)", async () => {
    const { token, id } = await providerSession();
    const first = await upload(token);
    const saved = await put(token, { documentTypeCode: "ID_PROOF", fileId: first }).expect(200);
    expect(saved.body.data).toMatchObject({ status: "PENDING", file: { id: first } });
    const listed = (await as(token).get("/providers/me/documents")).body.data.find(
      (d: { documentTypeCode: string }) => d.documentTypeCode === "ID_PROOF",
    );
    expect(listed.document.file.url).toBe("/api/v1/files/" + first);
    await database.providerDocument.updateMany({
      where: { providerId: id },
      data: { status: "RETURNED", remarks: "Blurry" },
    });
    const second = await upload(token);
    const replaced = await put(token, { documentTypeCode: "ID_PROOF", fileId: second }).expect(200);
    expect(replaced.body.data).toMatchObject({
      status: "PENDING",
      remarks: null,
      file: { id: second },
    });
    expect(
      (await database.storedFile.findUniqueOrThrow({ where: { id: first } })).deletedAt,
    ).not.toBeNull();
    expect(await database.providerDocument.count({ where: { providerId: id } })).toBe(1);
    await as(token)
      .get("/files/" + first)
      .expect(404);
    await as(token)
      .get("/files/" + second)
      .expect(200);
  });
  it("refuses files that are not yours, already attached, or wrong bucket", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const fileA = await upload(a.token);
    const bad = await put(b.token, { documentTypeCode: "ID_PROOF", fileId: fileA }).expect(422);
    expect(bad.body.code).toBe("FILE_NOT_AVAILABLE");
    await put(a.token, { documentTypeCode: "ID_PROOF", fileId: fileA }).expect(200);
    expect(
      (await put(a.token, { documentTypeCode: "BANK_PROOF", fileId: fileA }).expect(422)).body.code,
    ).toBe("FILE_NOT_AVAILABLE");
    const photo = await upload(a.token, "EQUIPMENT_PHOTO");
    await put(a.token, { documentTypeCode: "BANK_PROOF", fileId: photo }).expect(422);
  });
  it("validates type, equipment ownership and scope", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const tractor = await addEquipment(a.id, "TRACTOR");
    const rotavator = await addEquipment(a.id, "ROTAVATOR");
    const foreign = await addEquipment(b.id, "TRACTOR");
    await put(a.token, { documentTypeCode: "NOPE", fileId: await upload(a.token) }).expect(422);
    await put(a.token, { documentTypeCode: "MACHINE_RC", fileId: await upload(a.token) }).expect(
      422,
    );
    await put(a.token, {
      documentTypeCode: "ID_PROOF",
      equipmentId: tractor.id,
      fileId: await upload(a.token),
    }).expect(422);
    await put(a.token, {
      documentTypeCode: "MACHINE_RC",
      equipmentId: foreign.id,
      fileId: await upload(a.token),
    }).expect(422);
    await put(a.token, {
      documentTypeCode: "MACHINE_RC",
      equipmentId: rotavator.id,
      fileId: await upload(a.token),
    }).expect(422);
    await put(a.token, {
      documentTypeCode: "MACHINE_RC",
      equipmentId: tractor.id,
      fileId: await upload(a.token),
    }).expect(200);
  });
  it("applies the edit lock: provider documents lock after approval, equipment RCs do not", async () => {
    const { token, id } = await providerSession();
    const tractor = await addEquipment(id, "TRACTOR");
    await setStatus(id, "APPROVED");
    const blocked = await put(token, {
      documentTypeCode: "ID_PROOF",
      fileId: await upload(token),
    }).expect(409);
    expect(blocked.body.code).toBe("INVALID_STATE");
    await put(token, {
      documentTypeCode: "MACHINE_RC",
      equipmentId: tractor.id,
      fileId: await upload(token),
    }).expect(200);
    await setStatus(id, "SUBMITTED");
    await put(token, {
      documentTypeCode: "MACHINE_RC",
      equipmentId: tractor.id,
      fileId: await upload(token),
    }).expect(409);
  });
  it("deletes a document and soft-deletes its file; other providers get 404", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const fileId = await upload(a.token);
    const doc = (await put(a.token, { documentTypeCode: "ID_PROOF", fileId }).expect(200)).body.data
      .id;
    await as(b.token)
      .delete("/providers/me/documents/" + doc)
      .expect(404);
    await as(a.token)
      .delete("/providers/me/documents/" + doc)
      .expect(200);
    expect(await database.providerDocument.count({ where: { id: doc } })).toBe(0);
    expect(
      (await database.storedFile.findUniqueOrThrow({ where: { id: fileId } })).deletedAt,
    ).not.toBeNull();
    await as(a.token).delete("/providers/me/documents/not-a-uuid").expect(404);
  });
});

describe("document file access", () => {
  it("lets in-jurisdiction officers view (audited) and hides it from other districts", async () => {
    const { token, user } = await providerSession();
    const fileId = await upload(token);
    await as(token)
      .put("/providers/me/documents")
      .send({ documentTypeCode: "ID_PROOF", fileId })
      .expect(200);
    const near = await provisionOfficer("DISTRICT", geo.district.id);
    const far = await provisionOfficer("DISTRICT", geo.otherDistrict.id);
    const agent = await provisionOfficer("DISTRICT", geo.district.id, "FIELD_AGENT");
    const nearToken = (await signIn(near.username)).token;
    await as(nearToken)
      .get("/files/" + fileId)
      .expect(200);
    await as((await signIn(far.username)).token)
      .get("/files/" + fileId)
      .expect(404);
    await as((await signIn(agent.username)).token)
      .get("/files/" + fileId)
      .expect(404); // no provider.view
    const audits = await database.auditLog.findMany({
      where: { actorUserId: near.id, action: "FILE_VIEW", entityId: fileId },
    });
    expect(audits).toHaveLength(1);
    const owner = await database.auditLog.count({
      where: { actorUserId: user.id, action: "FILE_VIEW" },
    });
    expect(owner).toBe(0); // owners reading their own files are not audited
    // after replacement the old file is history: officers still see it, the owner does not
    const second = await upload(token);
    await as(token)
      .put("/providers/me/documents")
      .send({ documentTypeCode: "ID_PROOF", fileId: second })
      .expect(200);
    await as(nearToken)
      .get("/files/" + fileId)
      .expect(200);
    await as(token)
      .get("/files/" + fileId)
      .expect(404);
  });
  it("another provider cannot read the file", async () => {
    const a = await providerSession();
    const b = await providerSession();
    const fileId = await upload(a.token);
    await as(a.token)
      .put("/providers/me/documents")
      .send({ documentTypeCode: "ID_PROOF", fileId })
      .expect(200);
    await as(b.token)
      .get("/files/" + fileId)
      .expect(404);
  });
});

describe("bank account", () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    holderName: "Rama Rao",
    accountNumber: "123456789012",
    confirmAccountNumber: "123456789012",
    ifsc: "sbin0001234",
    ...overrides,
  });
  it("encrypts the account number, masks it in responses and keeps it out of audit logs", async () => {
    const { token, id, user } = await providerSession();
    const saved = await as(token).put("/providers/me/bank-account").send(body()).expect(200);
    expect(saved.body.data).toMatchObject({
      holderName: "Rama Rao",
      accountNumber: "XXXXXX9012",
      ifsc: "SBIN0001234",
      status: "PENDING",
    });
    const row = await database.providerBankAccount.findUniqueOrThrow({ where: { providerId: id } });
    expect(row.accountNoEnc).not.toContain("123456789012");
    expect(decryptField(row.accountNoEnc)).toBe("123456789012");
    expect(row.accountNoLast4).toBe("9012");
    const me = await as(token).get("/providers/me").expect(200);
    expect(JSON.stringify(me.body)).not.toContain("123456789012");
    expect(me.body.data.bankAccount.accountNumber).toBe("XXXXXX9012");
    const audits = await database.auditLog.findMany({ where: { actorUserId: user.id } });
    expect(JSON.stringify(audits)).not.toContain("123456789012");
  });
  it("validates number, confirmation and IFSC; resaving resets a RETURNED review", async () => {
    const { token, id } = await providerSession();
    for (const bad of [
      { accountNumber: "12345", confirmAccountNumber: "12345" },
      { accountNumber: "12345678901234567890", confirmAccountNumber: "12345678901234567890" },
      { confirmAccountNumber: "999999999999" },
      { ifsc: "SBIN1234567" },
      { holderName: "x" },
    ])
      await as(token).put("/providers/me/bank-account").send(body(bad)).expect(422);
    await as(token).put("/providers/me/bank-account").send(body()).expect(200);
    await database.providerBankAccount.update({
      where: { providerId: id },
      data: { status: "RETURNED", remarks: "Wrong IFSC" },
    });
    const again = await as(token)
      .put("/providers/me/bank-account")
      .send(body({ ifsc: "HDFC0000001" }))
      .expect(200);
    expect(again.body.data).toMatchObject({
      status: "PENDING",
      remarks: null,
      ifsc: "HDFC0000001",
    });
  });
  it("checks the IFSC directory only when it has data, and fills bank and branch", async () => {
    const { token } = await providerSession();
    await database.ifscCode.create({
      data: { ifsc: "TEST0000042", bank: "Test Bank", branch: "Main Branch" },
    });
    try {
      const unknown = await as(token)
        .put("/providers/me/bank-account")
        .send(body({ ifsc: "TEST0000099" }))
        .expect(422);
      expect(unknown.body.errors[0].field).toBe("ifsc");
      const known = await as(token)
        .put("/providers/me/bank-account")
        .send(body({ ifsc: "TEST0000042" }))
        .expect(200);
      expect(known.body.data).toMatchObject({ bankName: "Test Bank", branchName: "Main Branch" });
    } finally {
      await database.ifscCode.delete({ where: { ifsc: "TEST0000042" } });
    }
  });
  it("is locked once submitted or approved", async () => {
    const { token, id } = await providerSession();
    for (const status of ["SUBMITTED", "APPROVED"] as const) {
      await setStatus(id, status);
      expect(
        (await as(token).put("/providers/me/bank-account").send(body()).expect(409)).body.code,
      ).toBe("INVALID_STATE");
    }
  });
});

describe("submission checklist", () => {
  const item = (data: { items: { key: string; done: boolean }[] }, key: string) =>
    data.items.find((i) => i.key === key)!.done;
  it("reports only the profile done for a new provider", async () => {
    const { token } = await providerSession();
    const { body } = await as(token).get("/providers/me/checklist").expect(200);
    expect(body.data.canSubmit).toBe(false);
    expect(body.data.items.map((i: { key: string }) => i.key)).toEqual([
      "profile",
      "bankAccount",
      "documents",
      "equipment",
      "coverage",
      "workingHours",
    ]);
    expect(item(body.data, "profile")).toBe(true);
    for (const key of ["bankAccount", "documents", "equipment", "coverage", "workingHours"])
      expect(item(body.data, key)).toBe(false);
  });
  it("becomes submittable when everything is in place and drops on RETURNED items", async () => {
    const { token, id, user } = await providerSession();
    const tractor = await addEquipment(id, "TRACTOR");
    const photoFile = await database.storedFile.create({
      data: {
        bucket: "EQUIPMENT_PHOTO",
        relPath: "private/equipment-photos/test/" + uniqueName("p") + ".png",
        originalName: "p.png",
        mimeType: "image/png",
        sizeBytes: 1,
        sha256: "0".repeat(64),
        ownerUserId: user.id,
        attachedAt: new Date(),
      },
    });
    await database.equipmentPhoto.create({
      data: { equipmentId: tractor.id, fileId: photoFile.id, sortOrder: 0 },
    });
    const operation = await database.operation.findUniqueOrThrow({ where: { code: "PLOUGHING" } });
    await database.equipmentService.create({
      data: {
        equipmentId: tractor.id,
        operationId: operation.id,
        pricingBasis: "ACRE",
        ratePaise: 80000,
        workRateAcresPerHour: 1,
      },
    });
    await database.provider.update({
      where: { id },
      data: { coverageMode: "RADIUS", coverageRadiusKm: 25 },
    });
    await database.providerWorkingHours.create({
      data: { providerId: id, weekday: 1, startMinute: 360, endMinute: 1080 },
    });
    await as(token)
      .put("/providers/me/bank-account")
      .send({
        holderName: "Rama Rao",
        accountNumber: "123456789012",
        confirmAccountNumber: "123456789012",
        ifsc: "SBIN0001234",
      })
      .expect(200);
    const missing = (await as(token).get("/providers/me/checklist")).body.data;
    expect(item(missing, "documents")).toBe(false);
    expect(missing.canSubmit).toBe(false);
    const put = async (code: string, equipmentId?: string) =>
      as(token)
        .put("/providers/me/documents")
        .send({ documentTypeCode: code, equipmentId, fileId: await upload(token) })
        .expect(200);
    await put("ID_PROOF");
    await put("BANK_PROOF");
    await put("MACHINE_RC", tractor.id);
    const ready = (await as(token).get("/providers/me/checklist")).body.data;
    expect(ready.canSubmit).toBe(true);
    await database.providerDocument.updateMany({
      where: { providerId: id, documentTypeCode: "ID_PROOF" },
      data: { status: "RETURNED" },
    });
    expect(item((await as(token).get("/providers/me/checklist")).body.data, "documents")).toBe(
      false,
    );
    await database.providerDocument.updateMany({
      where: { providerId: id },
      data: { status: "ACCEPTED" },
    });
    await database.providerBankAccount.update({
      where: { providerId: id },
      data: { status: "RETURNED" },
    });
    expect(item((await as(token).get("/providers/me/checklist")).body.data, "bankAccount")).toBe(
      false,
    );
    await database.providerBankAccount.update({
      where: { providerId: id },
      data: { status: "PENDING" },
    });
    await database.equipmentService.updateMany({
      where: { equipmentId: tractor.id },
      data: { isActive: false },
    });
    expect(item((await as(token).get("/providers/me/checklist")).body.data, "equipment")).toBe(
      false,
    );
  });
});

describe("listable providers (FR-PRV-12)", () => {
  it("returns only APPROVED providers that have an ACTIVE equipment", async () => {
    const approvedActive = await providerSession();
    const approvedInactive = await providerSession();
    const approvedNone = await providerSession();
    const draftActive = await providerSession();
    const suspendedActive = await providerSession();
    await addEquipment(approvedActive.id, "TRACTOR");
    await addEquipment(approvedInactive.id, "TRACTOR", "INACTIVE");
    await addEquipment(draftActive.id, "TRACTOR");
    await addEquipment(suspendedActive.id, "TRACTOR");
    for (const s of [approvedActive, approvedInactive, approvedNone])
      await setStatus(s.id, "APPROVED");
    await setStatus(suspendedActive.id, "SUSPENDED");
    const ids = [approvedActive, approvedInactive, approvedNone, draftActive, suspendedActive].map(
      (s) => s.id,
    );
    const rows = await database.provider.findMany({
      where: { AND: [listableProviderWhere(), { id: { in: ids } }] },
      select: { id: true },
    });
    expect(rows.map((r) => r.id)).toEqual([approvedActive.id]);
  });
});

describe("admin user scope", () => {
  it("lets a district officer see provider and farmer accounts in their district only", async () => {
    const mine = await providerSession();
    const near = await provisionOfficer("DISTRICT", geo.district.id, "DISTRICT_OFFICER");
    const far = await provisionOfficer("DISTRICT", geo.otherDistrict.id);
    await as((await signIn(near.username)).token)
      .get("/admin/users/" + mine.user.id)
      .expect(200);
    await as((await signIn(far.username)).token)
      .get("/admin/users/" + mine.user.id)
      .expect(404);
  });
});
