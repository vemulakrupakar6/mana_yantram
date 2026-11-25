import { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { decryptField, encryptField } from "../../utils/field-crypto.js";
import { audit, lockUser } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { assertLocationHierarchy } from "../masters/location.js";
import { attachFile, detachAndDelete, present as presentFile } from "../files/files.service.js";
import { documentKey } from "./documents.policy.js";
import { computeChecklist } from "./providers.checklist.js";
import { assertProviderEditable, isEditable } from "./provider-state.js";
import { lockOwnProvider, providerIdOfUser, requiredDocumentsFor } from "./providers.repository.js";
import { toMinutes } from "./providers.schema.js";
import { roleLevel, roleNames } from "../rbac/roles.js";
import type {
  CoverageInput,
  WorkingHoursInput,
  BankAccountInput,
  DocumentUploadInput,
  ProviderProfileInput,
  ProviderProfilePatch,
} from "./providers.schema.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const invalid = (field: string, message: string) =>
  new AppError(422, "VALIDATION_ERROR", "Validation failed.", [{ field, message }]);
const names = { select: { id: true, nameEn: true, nameTe: true } } as const;

export const maskAccount = (last4: string) => "XXXXXX" + last4;
const minuteText = (minute: number) =>
  String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");

const providerSelect = {
  id: true,
  providerNo: true,
  type: true,
  name: true,
  contactPerson: true,
  mobile: true,
  email: true,
  addressLine: true,
  pincode: true,
  baseLatitude: true,
  baseLongitude: true,
  registrationNo: true,
  gstin: true,
  coverageMode: true,
  coverageRadiusKm: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  createdAt: true,
  district: names,
  mandal: names,
  village: names,
  bankAccount: {
    select: {
      holderName: true,
      accountNoLast4: true,
      ifsc: true,
      bankName: true,
      branchName: true,
      status: true,
      remarks: true,
    },
  },
  coverageAreas: {
    select: {
      mandalId: true,
      villageId: true,
      mandal: names,
      village: {
        select: { id: true, nameEn: true, nameTe: true, mandal: names },
      },
    },
    orderBy: { id: "asc" },
  },
  workingHours: {
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: { weekday: "asc" },
  },
  _count: { select: { operators: true } },
} satisfies Prisma.ProviderSelect;

async function presentProvider(row: Prisma.ProviderGetPayload<{ select: typeof providerSelect }>) {
  const [equipment, units, latest] = await Promise.all([
    database.equipment.count({ where: { providerId: row.id } }),
    database.equipmentUnit.count({ where: { equipment: { providerId: row.id } } }),
    row.status === "RETURNED"
      ? database.providerVerification.findFirst({
          where: { providerId: row.id, action: "RETURN" },
          orderBy: { createdAt: "desc" },
          select: { remarks: true, fieldRemarks: true, createdAt: true },
        })
      : null,
  ]);
  const { bankAccount, coverageAreas, workingHours, _count, ...rest } = row;
  return {
    ...rest,
    baseLatitude: row.baseLatitude.toFixed(6),
    baseLongitude: row.baseLongitude.toFixed(6),
    bankAccount: bankAccount && {
      holderName: bankAccount.holderName,
      accountNumber: maskAccount(bankAccount.accountNoLast4),
      ifsc: bankAccount.ifsc,
      bankName: bankAccount.bankName,
      branchName: bankAccount.branchName,
      status: bankAccount.status,
      remarks: bankAccount.remarks,
    },
    coverage: {
      mode: row.coverageMode,
      radiusKm: row.coverageRadiusKm,
      areas: coverageAreas,
    },
    workingHours: workingHours.map((h) => ({
      weekday: h.weekday,
      start: minuteText(h.startMinute),
      end: minuteText(h.endMinute),
    })),
    latestReturn: latest,
    counts: { equipment, units, operators: _count.operators },
    editable: {
      profile: isEditable(row.status, "profile"),
      equipment: isEditable(row.status, "equipment"),
      coverage: isEditable(row.status, "coverage"),
      operators: isEditable(row.status, "operators"),
    },
  };
}
async function loadPresented(providerId: string) {
  return presentProvider(
    await database.provider.findUniqueOrThrow({
      where: { id: providerId },
      select: providerSelect,
    }),
  );
}

/* --------------------------------- profile --------------------------------- */

export async function createProfile(
  user: UserSummary,
  input: ProviderProfileInput,
  details: RequestDetails,
) {
  return database
    .$transaction(async (tx) => {
      const account = await lockUser(tx, user.id);
      if (!account || account.status !== "ACTIVE")
        throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
      if (await tx.provider.findUnique({ where: { userId: user.id }, select: { id: true } }))
        throw new AppError(409, "PROFILE_EXISTS", "Your provider profile already exists.");
      await assertLocationHierarchy(tx, input);
      const [{ no }] = await tx.$queryRaw<{ no: string }[]>`
      SELECT 'PRV' || to_char(now(), 'YY') || lpad(nextval('provider_no_seq')::text, 6, '0') AS no`;
      const provider = await tx.provider.create({
        data: {
          providerNo: no,
          userId: user.id,
          type: input.type,
          name: input.name,
          contactPerson: input.contactPerson,
          mobile: input.mobile,
          email: input.email,
          addressLine: input.addressLine,
          pincode: input.pincode,
          districtId: input.districtId,
          mandalId: input.mandalId,
          villageId: input.villageId,
          baseLatitude: input.baseLatitude,
          baseLongitude: input.baseLongitude,
          registrationNo: input.registrationNo,
          gstin: input.gstin,
        },
        select: { id: true },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { code: "PROVIDER" } });
      await tx.userRoleOnboarding.updateMany({
        where: { userId: user.id, roleId: role.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await audit(tx, details, "PROVIDER_PROFILE_CREATED", user.id, {
        entityType: "provider",
        entityId: provider.id,
        metadata: { providerNo: no, type: input.type },
      });
      return provider.id;
    })
    .then(loadPresented);
}
export async function getMine(user: UserSummary) {
  return loadPresented(await providerIdOfUser(user.id));
}
export async function updateProfile(
  user: UserSummary,
  input: ProviderProfilePatch,
  details: RequestDetails,
) {
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "profile");
    const merged = {
      type: input.type ?? provider.type,
      registrationNo:
        input.registrationNo === undefined ? provider.registrationNo : input.registrationNo,
    };
    if (merged.type !== "INDIVIDUAL" && !merged.registrationNo)
      throw invalid("registrationNo", "A registration number is required for this provider type.");
    if (input.districtId && input.mandalId && input.villageId)
      await assertLocationHierarchy(tx, {
        districtId: input.districtId,
        mandalId: input.mandalId,
        villageId: input.villageId,
      });
    await tx.provider.update({ where: { id: provider.id }, data: input });
    await audit(tx, details, "PROVIDER_PROFILE_UPDATED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { fields: Object.keys(input) },
    });
    return provider.id;
  });
  return loadPresented(id);
}

/* -------------------------------- documents -------------------------------- */

const fileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  bucket: true,
} as const;
export async function listDocuments(user: UserSummary) {
  return documentRows(await providerIdOfUser(user.id));
}
/** Required documents merged with whatever is uploaded; shared with the officer review screen. */
export async function documentRows(providerId: string) {
  const provider = await database.provider.findUniqueOrThrow({
    where: { id: providerId },
    select: { id: true, type: true },
  });
  const [required, uploaded, types, equipment] = await Promise.all([
    requiredDocumentsFor(provider),
    database.providerDocument.findMany({
      where: { providerId },
      select: {
        id: true,
        documentTypeCode: true,
        equipmentId: true,
        status: true,
        remarks: true,
        updatedAt: true,
        file: { select: fileSelect },
      },
    }),
    database.documentType.findMany({
      select: { code: true, nameEn: true, nameTe: true, scope: true },
    }),
    database.equipment.findMany({
      where: { providerId },
      select: { id: true, make: true, model: true, year: true },
    }),
  ]);
  const byCode = new Map(types.map((t) => [t.code, t]));
  const labels = new Map(equipment.map((e) => [e.id, `${e.make} ${e.model} (${e.year})`]));
  const byKey = new Map(uploaded.map((d) => [documentKey(d.documentTypeCode, d.equipmentId), d]));
  const requiredKeys = new Set(required.map((r) => documentKey(r.documentTypeCode, r.equipmentId)));
  const row = (
    code: string,
    equipmentId: string | null,
    equipmentLabel: string | null,
    isRequired: boolean,
  ) => {
    const doc = byKey.get(documentKey(code, equipmentId));
    const type = byCode.get(code);
    return {
      documentTypeCode: code,
      nameEn: type?.nameEn ?? code,
      nameTe: type?.nameTe ?? code,
      scope: type?.scope ?? (equipmentId ? "EQUIPMENT" : "PROVIDER"),
      equipmentId,
      equipmentLabel,
      required: isRequired,
      document: doc && {
        id: doc.id,
        status: doc.status,
        remarks: doc.remarks,
        updatedAt: doc.updatedAt,
        file: presentFile(doc.file),
      },
    };
  };
  const items = required.map((r) => row(r.documentTypeCode, r.equipmentId, r.equipmentLabel, true));
  // Documents uploaded earlier that are no longer required (e.g. equipment later deactivated).
  for (const doc of uploaded)
    if (!requiredKeys.has(documentKey(doc.documentTypeCode, doc.equipmentId)))
      items.push(
        row(
          doc.documentTypeCode,
          doc.equipmentId,
          doc.equipmentId ? (labels.get(doc.equipmentId) ?? null) : null,
          false,
        ),
      );
  return items;
}
export async function putDocument(
  user: UserSummary,
  input: DocumentUploadInput,
  details: RequestDetails,
) {
  const documentId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    const type = await tx.documentType.findFirst({
      where: { code: input.documentTypeCode, isActive: true },
      select: { code: true, scope: true },
    });
    if (!type) throw invalid("documentTypeCode", "Unknown document type.");
    let equipmentId: string | null = null;
    if (type.scope === "PROVIDER") {
      if (input.equipmentId)
        throw invalid("equipmentId", "This document is not tied to equipment.");
      assertProviderEditable(provider, "profile");
    } else {
      if (!input.equipmentId) throw invalid("equipmentId", "Choose the equipment.");
      assertProviderEditable(provider, "equipmentDocuments");
      const equipment = await tx.equipment.findFirst({
        where: { id: input.equipmentId, providerId: provider.id, status: "ACTIVE" },
        select: { id: true, categoryId: true },
      });
      if (!equipment) throw invalid("equipmentId", "Unknown equipment.");
      const applies = await tx.categoryDocumentType.findUnique({
        where: {
          categoryId_documentTypeCode: {
            categoryId: equipment.categoryId,
            documentTypeCode: type.code,
          },
        },
        select: { categoryId: true },
      });
      if (!applies)
        throw invalid("documentTypeCode", "This document is not required for that equipment.");
      equipmentId = equipment.id;
    }
    await attachFile(tx, {
      fileId: input.fileId,
      userId: user.id,
      bucket: "DOCUMENT",
      entityType: "provider",
      entityId: provider.id,
    });
    const existing = await tx.providerDocument.findFirst({
      where: { providerId: provider.id, documentTypeCode: type.code, equipmentId },
      select: { id: true, fileId: true },
    });
    let id: string;
    if (existing) {
      await detachAndDelete(tx, existing.fileId);
      await tx.providerDocument.update({
        where: { id: existing.id },
        data: {
          fileId: input.fileId,
          status: "PENDING",
          remarks: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      id = existing.id;
    } else {
      id = (
        await tx.providerDocument.create({
          data: {
            providerId: provider.id,
            documentTypeCode: type.code,
            equipmentId,
            fileId: input.fileId,
          },
          select: { id: true },
        })
      ).id;
    }
    await audit(tx, details, "PROVIDER_DOCUMENT_UPLOADED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { documentTypeCode: type.code, equipmentId, replaced: Boolean(existing) },
    });
    return id;
  });
  const doc = await database.providerDocument.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      id: true,
      documentTypeCode: true,
      equipmentId: true,
      status: true,
      remarks: true,
      file: { select: fileSelect },
    },
  });
  return { ...doc, file: presentFile(doc.file) };
}
export async function deleteDocument(
  user: UserSummary,
  documentId: string,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    const doc = await tx.providerDocument.findFirst({
      where: { id: documentId, providerId: provider.id },
      select: { id: true, fileId: true, documentTypeCode: true, equipmentId: true },
    });
    if (!doc) throw notFound();
    assertProviderEditable(provider, doc.equipmentId ? "equipmentDocuments" : "profile");
    await tx.providerDocument.delete({ where: { id: doc.id } });
    await detachAndDelete(tx, doc.fileId);
    await audit(tx, details, "PROVIDER_DOCUMENT_DELETED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { documentTypeCode: doc.documentTypeCode, equipmentId: doc.equipmentId },
    });
  });
}

/* ------------------------------- bank account ------------------------------- */

export async function putBankAccount(
  user: UserSummary,
  input: BankAccountInput,
  details: RequestDetails,
) {
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "profile");
    let bankName: string | null = null;
    let branchName: string | null = null;
    // The IFSC directory is optional: with an empty table only the format is checked.
    if ((await tx.ifscCode.count()) > 0) {
      const row = await tx.ifscCode.findUnique({ where: { ifsc: input.ifsc } });
      if (!row) throw invalid("ifsc", "Unknown IFSC code.");
      bankName = row.bank;
      branchName = row.branch;
    }
    const data = {
      holderName: input.holderName,
      accountNoEnc: encryptField(input.accountNumber),
      accountNoLast4: input.accountNumber.slice(-4),
      ifsc: input.ifsc,
      bankName,
      branchName,
      status: "PENDING" as const,
      remarks: null,
      reviewedById: null,
      reviewedAt: null,
    };
    await tx.providerBankAccount.upsert({
      where: { providerId: provider.id },
      create: { providerId: provider.id, ...data },
      update: data,
    });
    // Never log the account number; only that it changed.
    await audit(tx, details, "PROVIDER_BANK_SAVED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { ifsc: input.ifsc },
    });
    return provider.id;
  });
  return (await loadPresented(id)).bankAccount;
}
/** Only for the audited officer reveal endpoint (Phase 7). */
export const revealAccountNumber = (encrypted: string) => decryptField(encrypted);

export async function getChecklist(user: UserSummary) {
  return computeChecklist(await providerIdOfUser(user.id));
}

/* -------------------------- coverage and working hours -------------------------- */

export async function putCoverage(
  user: UserSummary,
  input: CoverageInput,
  details: RequestDetails,
) {
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "coverage");
    if (input.mode === "RADIUS") {
      await tx.providerCoverageArea.deleteMany({ where: { providerId: provider.id } });
      await tx.provider.update({
        where: { id: provider.id },
        data: { coverageMode: "RADIUS", coverageRadiusKm: input.radiusKm },
      });
    } else {
      const mandalIds = [
        ...new Set(input.areas.flatMap((a) => ("mandalId" in a ? [a.mandalId] : []))),
      ];
      const villageIds = [
        ...new Set(input.areas.flatMap((a) => ("villageId" in a ? [a.villageId] : []))),
      ];
      const mandals = await tx.mandal.count({ where: { id: { in: mandalIds }, isActive: true } });
      const villages = await tx.village.count({
        where: { id: { in: villageIds }, isActive: true },
      });
      if (mandals !== mandalIds.length) throw invalid("areas", "One of the mandals is unknown.");
      if (villages !== villageIds.length) throw invalid("areas", "One of the villages is unknown.");
      await tx.providerCoverageArea.deleteMany({ where: { providerId: provider.id } });
      await tx.providerCoverageArea.createMany({
        data: [
          ...mandalIds.map((mandalId) => ({ providerId: provider.id, mandalId })),
          ...villageIds.map((villageId) => ({ providerId: provider.id, villageId })),
        ],
      });
      await tx.provider.update({
        where: { id: provider.id },
        data: { coverageMode: "AREAS", coverageRadiusKm: null },
      });
    }
    await audit(tx, details, "PROVIDER_COVERAGE_UPDATED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { mode: input.mode },
    });
    return provider.id;
  });
  return loadPresented(id);
}
export async function putWorkingHours(
  user: UserSummary,
  input: WorkingHoursInput,
  details: RequestDetails,
) {
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "coverage");
    await tx.providerWorkingHours.deleteMany({ where: { providerId: provider.id } });
    await tx.providerWorkingHours.createMany({
      data: input.days.map((d) => ({
        providerId: provider.id,
        weekday: d.weekday,
        startMinute: toMinutes(d.start),
        endMinute: toMinutes(d.end),
      })),
    });
    await audit(tx, details, "PROVIDER_HOURS_UPDATED", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { days: input.days.length },
    });
    return provider.id;
  });
  return (await loadPresented(id)).workingHours;
}

/* ------------------------- submission and history ------------------------- */

export async function submitApplication(user: UserSummary, details: RequestDetails) {
  const id = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    if (provider.status !== "DRAFT" && provider.status !== "RETURNED")
      throw new AppError(
        409,
        "INVALID_STATE",
        "This application cannot be submitted in its current state.",
      );
    // Re-checked under the lock, so nothing can change between the check and the transition.
    // A RETURNED document or bank row also keeps its checklist item undone, which blocks resubmission.
    const checklist = await computeChecklist(provider.id, tx);
    if (!checklist.canSubmit)
      throw new AppError(
        422,
        "APPLICATION_INCOMPLETE",
        "Complete every checklist item before submitting.",
        checklist.items
          .filter((item) => !item.done)
          .map((item) => ({ field: item.key, message: item.key })),
      );
    await tx.provider.update({
      where: { id: provider.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    await tx.providerVerification.create({
      data: {
        providerId: provider.id,
        action: "SUBMIT",
        fromStatus: provider.status,
        toStatus: "SUBMITTED",
        actorId: user.id,
      },
    });
    await audit(tx, details, "PROVIDER_SUBMIT", user.id, {
      entityType: "provider",
      entityId: provider.id,
      metadata: { from: provider.status },
    });
    return provider.id;
  });
  return loadPresented(id);
}

/** Newest first. The actor is shown as their role, never their username. */
export async function historyFor(providerId: string) {
  const rows = await database.providerVerification.findMany({
    where: { providerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      remarks: true,
      fieldRemarks: true,
      createdAt: true,
      actor: { select: { roles: { select: { role: { select: { code: true } } } } } },
    },
  });
  return rows.map(({ actor, ...row }) => {
    const codes = actor.roles.map((r) => r.role.code);
    const top = [...codes].sort((a, b) => roleLevel[b] - roleLevel[a])[0];
    return { ...row, actorRole: top ?? null, actorRoleName: top ? roleNames[top] : null };
  });
}
export async function getHistory(user: UserSummary) {
  return historyFor(await providerIdOfUser(user.id));
}
