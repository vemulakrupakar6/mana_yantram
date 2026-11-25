import type { Prisma, ProviderStatus, VerificationAction } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { decryptField } from "../../utils/field-crypto.js";
import { audit } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { present as presentFile } from "../files/files.service.js";
import { jurisdictionWhere } from "../rbac/jurisdiction.js";
import { documentKey } from "../providers/documents.policy.js";
import { documentRows, historyFor, maskAccount } from "../providers/providers.service.js";
import { lockProvider, requiredDocumentsFor } from "../providers/providers.repository.js";
import type { ListQuery, ReviewInput, VerifyInput } from "./admin-providers.schema.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const names = { select: { id: true, nameEn: true, nameTe: true } } as const;
type Tx = Prisma.TransactionClient;

/** Providers the officer may see: their jurisdiction only; anything else does not exist for them. */
const scoped = (user: UserSummary, id: string): Prisma.ProviderWhereInput => ({
  AND: [{ id }, jurisdictionWhere(user)],
});
async function lockScoped(tx: Tx, user: UserSummary, id: string) {
  if (!(await tx.provider.findFirst({ where: scoped(user, id), select: { id: true } })))
    throw notFound();
  const provider = await lockProvider(tx, id);
  if (!provider) throw notFound();
  return provider;
}

/* ---------------------------------- queue ---------------------------------- */

export async function listProviders(user: UserSummary, query: ListQuery) {
  const submitted =
    query.submittedFrom || query.submittedTo
      ? {
          submittedAt: {
            ...(query.submittedFrom ? { gte: new Date(query.submittedFrom) } : {}),
            ...(query.submittedTo ? { lte: new Date(query.submittedTo) } : {}),
          },
        }
      : {};
  const where: Prisma.ProviderWhereInput = {
    AND: [
      jurisdictionWhere(user),
      query.status ? { status: query.status } : {},
      query.districtId ? { districtId: query.districtId } : {},
      query.mandalId ? { mandalId: query.mandalId } : {},
      query.type ? { type: query.type } : {},
      submitted,
      query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { providerNo: { contains: query.search, mode: "insensitive" } },
              { mobile: { contains: query.search } },
            ],
          }
        : {},
    ],
  };
  // The review queue is worked oldest first; every other view shows the most recent first.
  const orderBy: Prisma.ProviderOrderByWithRelationInput[] =
    query.status === "SUBMITTED"
      ? [{ submittedAt: "asc" }, { id: "asc" }]
      : [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];
  const [total, rows] = await Promise.all([
    database.provider.count({ where }),
    database.provider.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        providerNo: true,
        name: true,
        type: true,
        status: true,
        mobile: true,
        submittedAt: true,
        district: names,
        mandal: names,
        documents: { where: { status: "PENDING" }, select: { id: true } },
        bankAccount: { select: { status: true } },
      },
    }),
  ]);
  return {
    items: rows.map(({ documents, bankAccount, ...row }) => ({
      ...row,
      pendingDocs: documents.length + (bankAccount?.status === "PENDING" ? 1 : 0),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/* --------------------------------- detail ---------------------------------- */

export async function getProvider(user: UserSummary, id: string) {
  const row = await database.provider.findFirst({
    where: scoped(user, id),
    select: {
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
          reviewedAt: true,
        },
      },
      coverageAreas: {
        select: {
          mandal: names,
          village: { select: { id: true, nameEn: true, nameTe: true, mandal: names } },
        },
      },
      workingHours: {
        select: { weekday: true, startMinute: true, endMinute: true },
        orderBy: { weekday: "asc" },
      },
      equipment: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          capacityValue: true,
          capacityUnit: true,
          implements: true,
          status: true,
          category: { select: { id: true, code: true, nameEn: true, nameTe: true } },
          units: {
            select: {
              id: true,
              unitLabel: true,
              registrationNo: true,
              droneUin: true,
              status: true,
            },
            orderBy: { unitLabel: "asc" },
          },
          photos: {
            orderBy: { sortOrder: "asc" },
            select: {
              file: {
                select: {
                  id: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  bucket: true,
                },
              },
            },
          },
          services: {
            where: { isActive: true },
            select: {
              id: true,
              pricingBasis: true,
              ratePaise: true,
              minChargePaise: true,
              travelMode: true,
              travelFlatPaise: true,
              travelPerKmPaise: true,
              freeRadiusKm: true,
              workRateAcresPerHour: true,
              operation: { select: { id: true, code: true, nameEn: true, nameTe: true } },
            },
          },
        },
      },
      operators: {
        select: {
          id: true,
          fullName: true,
          licenceNo: true,
          status: true,
          licenceFile: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) throw notFound();
  const { bankAccount, equipment, workingHours, coverageAreas, ...rest } = row;
  const minute = (m: number) =>
    String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
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
      reviewedAt: bankAccount.reviewedAt,
    },
    coverage: { mode: row.coverageMode, radiusKm: row.coverageRadiusKm, areas: coverageAreas },
    workingHours: workingHours.map((h) => ({
      weekday: h.weekday,
      start: minute(h.startMinute),
      end: minute(h.endMinute),
    })),
    equipment: equipment.map(({ photos, capacityValue, services, ...e }) => ({
      ...e,
      capacityValue: capacityValue?.toFixed(2) ?? null,
      photos: photos.map((p) => presentFile(p.file)),
      services: services.map((s) => ({
        ...s,
        freeRadiusKm: s.freeRadiusKm?.toFixed(2) ?? null,
        workRateAcresPerHour: s.workRateAcresPerHour.toFixed(2),
      })),
    })),
    documents: await documentRows(id),
    history: await historyFor(id),
  };
}

/* ------------------------------ item reviews ------------------------------- */

export async function reviewDocument(
  user: UserSummary,
  providerId: string,
  documentId: string,
  input: ReviewInput,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockScoped(tx, user, providerId);
    const doc = await tx.providerDocument.findFirst({
      where: { id: documentId, providerId },
      select: { id: true, equipmentId: true, documentTypeCode: true },
    });
    if (!doc) throw notFound();
    // Documents are reviewed during verification; equipment documents also after approval.
    const open =
      provider.status === "SUBMITTED" ||
      (Boolean(doc.equipmentId) &&
        (provider.status === "APPROVED" || provider.status === "SUSPENDED"));
    if (!open)
      throw new AppError(
        409,
        "INVALID_STATE",
        "Documents cannot be reviewed in the current state.",
      );
    await tx.providerDocument.update({
      where: { id: doc.id },
      data: {
        status: input.decision === "ACCEPT" ? "ACCEPTED" : "RETURNED",
        remarks: input.decision === "RETURN" ? input.remarks : null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    await audit(tx, details, "PROVIDER_DOCUMENT_REVIEWED", user.id, {
      entityType: "provider",
      entityId: providerId,
      metadata: { documentId, documentTypeCode: doc.documentTypeCode, decision: input.decision },
    });
  });
  return (await documentRows(providerId)).find((d) => d.document?.id === documentId)!;
}
export async function reviewBank(
  user: UserSummary,
  providerId: string,
  input: ReviewInput,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockScoped(tx, user, providerId);
    if (provider.status !== "SUBMITTED")
      throw new AppError(
        409,
        "INVALID_STATE",
        "The bank account can only be reviewed while the application is submitted.",
      );
    const result = await tx.providerBankAccount.updateMany({
      where: { providerId },
      data: {
        status: input.decision === "ACCEPT" ? "ACCEPTED" : "RETURNED",
        remarks: input.decision === "RETURN" ? input.remarks : null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    if (result.count !== 1) throw notFound();
    await audit(tx, details, "PROVIDER_BANK_REVIEWED", user.id, {
      entityType: "provider",
      entityId: providerId,
      metadata: { decision: input.decision },
    });
  });
  return (await getProvider(user, providerId)).bankAccount;
}
/** The only unmasked path to a bank account number. Always audited, never logs the value. */
export async function revealBank(user: UserSummary, providerId: string, details: RequestDetails) {
  return database.$transaction(async (tx) => {
    if (!(await tx.provider.findFirst({ where: scoped(user, providerId), select: { id: true } })))
      throw notFound();
    const bank = await tx.providerBankAccount.findUnique({ where: { providerId } });
    if (!bank) throw notFound();
    await audit(tx, details, "BANK_ACCOUNT_REVEALED", user.id, {
      entityType: "provider",
      entityId: providerId,
    });
    return {
      holderName: bank.holderName,
      accountNumber: decryptField(bank.accountNoEnc),
      ifsc: bank.ifsc,
    };
  });
}

/* ------------------------------ status changes ------------------------------ */

async function transition(
  tx: Tx,
  user: UserSummary,
  provider: { id: string; status: ProviderStatus },
  action: VerificationAction,
  to: ProviderStatus,
  details: RequestDetails,
  extra: { remarks?: string; fieldRemarks?: object; data?: Prisma.ProviderUpdateInput } = {},
) {
  await tx.provider.update({ where: { id: provider.id }, data: { status: to, ...extra.data } });
  await tx.providerVerification.create({
    data: {
      providerId: provider.id,
      action,
      fromStatus: provider.status,
      toStatus: to,
      remarks: extra.remarks,
      fieldRemarks: extra.fieldRemarks as Prisma.InputJsonObject | undefined,
      actorId: user.id,
    },
  });
  await audit(tx, details, "PROVIDER_" + action, user.id, {
    entityType: "provider",
    entityId: provider.id,
    metadata: { from: provider.status, to },
  });
}
const wrongState = (needed: string) =>
  new AppError(409, "INVALID_STATE", "This action needs the provider to be " + needed + ".");

export async function verify(
  user: UserSummary,
  id: string,
  input: VerifyInput,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockScoped(tx, user, id);
    if (provider.status !== "SUBMITTED") throw wrongState("submitted");
    if (input.action === "APPROVE") {
      const required = await requiredDocumentsFor(provider, tx);
      const docs = await tx.providerDocument.findMany({
        where: { providerId: id },
        select: { documentTypeCode: true, equipmentId: true, status: true },
      });
      const byKey = new Map(
        docs.map((d) => [documentKey(d.documentTypeCode, d.equipmentId), d.status]),
      );
      const pending = required.filter(
        (r) => byKey.get(documentKey(r.documentTypeCode, r.equipmentId)) !== "ACCEPTED",
      );
      const bank = await tx.providerBankAccount.findUnique({
        where: { providerId: id },
        select: { status: true },
      });
      const errors = [
        ...pending.map((r) => ({
          field: "documents",
          message: r.documentTypeCode + (r.equipmentId ? ":" + r.equipmentId : ""),
        })),
        ...(bank?.status === "ACCEPTED" ? [] : [{ field: "bankAccount", message: "bankAccount" }]),
      ];
      if (errors.length)
        throw new AppError(
          422,
          "APPLICATION_INCOMPLETE",
          "Every required document and the bank account must be accepted first.",
          errors,
        );
      await transition(tx, user, provider, "APPROVE", "APPROVED", details, {
        remarks: input.remarks,
        data: { approvedAt: new Date(), approvedBy: { connect: { id: user.id } } },
      });
    } else if (input.action === "RETURN") {
      const hasFieldRemarks = Object.keys(input.fieldRemarks ?? {}).length > 0;
      // One connection per transaction: queries must run one after another.
      const returnedDocs = await tx.providerDocument.count({
        where: { providerId: id, status: "RETURNED" },
      });
      const bank = await tx.providerBankAccount.findUnique({
        where: { providerId: id },
        select: { status: true },
      });
      if (!input.remarks && !hasFieldRemarks && returnedDocs === 0 && bank?.status !== "RETURNED")
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "Add at least one remark, or return a document, before returning the application.",
          [{ field: "remarks", message: "Add at least one remark." }],
        );
      await transition(tx, user, provider, "RETURN", "RETURNED", details, {
        remarks: input.remarks,
        fieldRemarks: input.fieldRemarks,
      });
    } else {
      if (!input.remarks)
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "Remarks are required to reject an application.",
          [{ field: "remarks", message: "Remarks are required." }],
        );
      await transition(tx, user, provider, "REJECT", "REJECTED", details, {
        remarks: input.remarks,
      });
    }
  });
  return getProvider(user, id);
}
async function simple(
  user: UserSummary,
  id: string,
  action: VerificationAction,
  from: ProviderStatus[],
  to: ProviderStatus,
  needs: string,
  remarks: string | undefined,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockScoped(tx, user, id);
    if (!from.includes(provider.status)) throw wrongState(needs);
    await transition(tx, user, provider, action, to, details, { remarks });
  });
  return getProvider(user, id);
}
export const suspend = (u: UserSummary, id: string, remarks: string, d: RequestDetails) =>
  simple(u, id, "SUSPEND", ["APPROVED"], "SUSPENDED", "approved", remarks, d);
export const blacklist = (u: UserSummary, id: string, remarks: string, d: RequestDetails) =>
  simple(
    u,
    id,
    "BLACKLIST",
    ["APPROVED", "SUSPENDED"],
    "BLACKLISTED",
    "approved or suspended",
    remarks,
    d,
  );
export const reinstate = (
  u: UserSummary,
  id: string,
  remarks: string | undefined,
  d: RequestDetails,
) => simple(u, id, "REINSTATE", ["SUSPENDED"], "APPROVED", "suspended", remarks, d);
