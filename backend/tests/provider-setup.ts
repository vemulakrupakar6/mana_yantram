import { randomInt } from "node:crypto";
import { database } from "../src/config/database.js";
import { as, provisionProvider, sampleGeo, signIn } from "./factories.js";

export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
/** A provider account with a completed DRAFT profile in the first sample district. */
export async function providerSession() {
  const geo = await sampleGeo();
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
  return { user, token, id, geo };
}
export type ProviderSession = Awaited<ReturnType<typeof providerSession>>;
export const mobile = () => "9" + String(randomInt(0, 1e9)).padStart(9, "0");
export const setStatus = (
  id: string,
  status:
    "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "SUSPENDED" | "REJECTED" | "BLACKLISTED",
) => database.provider.update({ where: { id }, data: { status } });

/** Direct DB insert (the equipment API needs uploaded photos; these tests do not). */
export async function addEquipment(providerId: string, categoryCode = "TRACTOR", units = 1) {
  const category = await database.serviceCategory.findUniqueOrThrow({
    where: { code: categoryCode },
  });
  const equipment = await database.equipment.create({
    data: { providerId, categoryId: category.id, make: "Mahindra", model: "575", year: 2020 },
  });
  await database.equipmentUnit.createMany({
    data: Array.from({ length: units }, (_, i) => ({
      equipmentId: equipment.id,
      unitLabel: "Unit " + (i + 1),
    })),
  });
  const rows = await database.equipmentUnit.findMany({
    where: { equipmentId: equipment.id },
    orderBy: { unitLabel: "asc" },
  });
  return { ...equipment, units: rows };
}

/**
 * Brings a DRAFT provider to a fully submittable state: one tractor (photo, service), radius coverage,
 * working hours, bank account and the three required documents.
 */
export async function completeApplication(s: ProviderSession) {
  const eq = await addEquipment(s.id, "TRACTOR", 2);
  const photo = await database.storedFile.create({
    data: {
      bucket: "EQUIPMENT_PHOTO",
      relPath: "private/equipment-photos/test/" + eq.id + ".png",
      originalName: "p.png",
      mimeType: "image/png",
      sizeBytes: 1,
      sha256: "0".repeat(64),
      ownerUserId: s.user.id,
      attachedAt: new Date(),
    },
  });
  await database.equipmentPhoto.create({
    data: { equipmentId: eq.id, fileId: photo.id, sortOrder: 0 },
  });
  const operation = await database.operation.findUniqueOrThrow({ where: { code: "PLOUGHING" } });
  await database.equipmentService.create({
    data: {
      equipmentId: eq.id,
      operationId: operation.id,
      pricingBasis: "ACRE",
      ratePaise: 80000,
      workRateAcresPerHour: 1,
    },
  });
  await as(s.token)
    .put("/providers/me/coverage")
    .send({ mode: "RADIUS", radiusKm: 25 })
    .expect(200);
  await as(s.token)
    .put("/providers/me/working-hours")
    .send({ days: [{ weekday: 1, start: "06:00", end: "18:00" }] })
    .expect(200);
  await as(s.token)
    .put("/providers/me/bank-account")
    .send({
      holderName: "Rama Rao",
      accountNumber: "123456789012",
      confirmAccountNumber: "123456789012",
      ifsc: "SBIN0001234",
    })
    .expect(200);
  const upload = async () =>
    (
      await as(s.token)
        .post("/files")
        .field("purpose", "DOCUMENT")
        .attach("file", png, "doc.png")
        .expect(201)
    ).body.data.id as string;
  for (const [code, equipmentId] of [
    ["ID_PROOF", undefined],
    ["BANK_PROOF", undefined],
    ["MACHINE_RC", eq.id],
  ] as const)
    await as(s.token)
      .put("/providers/me/documents")
      .send({ documentTypeCode: code, equipmentId, fileId: await upload() })
      .expect(200);
  return eq;
}
export async function replaceDocument(
  s: ProviderSession,
  documentTypeCode: string,
  equipmentId?: string,
) {
  const fileId = (
    await as(s.token)
      .post("/files")
      .field("purpose", "DOCUMENT")
      .attach("file", png, "new.png")
      .expect(201)
  ).body.data.id as string;
  return as(s.token).put("/providers/me/documents").send({ documentTypeCode, equipmentId, fileId });
}
