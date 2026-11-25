import { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { audit } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { attachFile, detachAndDelete, present as presentFile } from "../files/files.service.js";
import { assertWithinRateCap } from "../rate-caps/rate-caps.service.js";
import { assertProviderEditable } from "../providers/provider-state.js";
import { lockOwnProvider, providerIdOfUser } from "../providers/providers.repository.js";
import {
  serviceSchema,
  type CreateEquipmentInput,
  type ServiceInput,
  type ServicePatch,
  type UpdateEquipmentInput,
  type UpdateUnitInput,
} from "./equipment.schema.js";

const MAX_UNITS = 50;
const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const invalid = (field: string, message: string, status = 422, code = "VALIDATION_ERROR") =>
  new AppError(status, code, message, [{ field, message }]);
type Tx = Prisma.TransactionClient;

const categorySelect = {
  select: { id: true, code: true, nameEn: true, nameTe: true, requiresPilotLicence: true },
} as const;
const photoSelect = {
  select: {
    sortOrder: true,
    file: {
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, bucket: true },
    },
  },
  orderBy: { sortOrder: "asc" },
} as const;
const serviceSelect = {
  id: true,
  pricingBasis: true,
  ratePaise: true,
  minChargePaise: true,
  travelMode: true,
  travelFlatPaise: true,
  travelPerKmPaise: true,
  freeRadiusKm: true,
  workRateAcresPerHour: true,
  isActive: true,
  operation: { select: { id: true, code: true, nameEn: true, nameTe: true } },
} satisfies Prisma.EquipmentServiceSelect;
type ServiceRow = Prisma.EquipmentServiceGetPayload<{ select: typeof serviceSelect }>;
const presentService = (row: ServiceRow) => ({
  ...row,
  freeRadiusKm: row.freeRadiusKm?.toFixed(2) ?? null,
  workRateAcresPerHour: row.workRateAcresPerHour.toFixed(2),
});
const unitSelect = {
  id: true,
  unitLabel: true,
  registrationNo: true,
  droneUin: true,
  status: true,
} as const;

const detailSelect = {
  id: true,
  make: true,
  model: true,
  year: true,
  capacityValue: true,
  capacityUnit: true,
  implements: true,
  status: true,
  createdAt: true,
  category: categorySelect,
  photos: photoSelect,
  units: { select: unitSelect, orderBy: { unitLabel: "asc" } },
  services: { select: serviceSelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.EquipmentSelect;
type DetailRow = Prisma.EquipmentGetPayload<{ select: typeof detailSelect }>;
const naturalUnitOrder = <T extends { unitLabel: string }>(units: T[]) =>
  [...units].sort((a, b) => unitNumber(a.unitLabel) - unitNumber(b.unitLabel));
const unitNumber = (label: string) => Number(label.match(/(\d+)$/)?.[1] ?? 0);
const presentDetail = (row: DetailRow) => ({
  ...row,
  capacityValue: row.capacityValue?.toFixed(2) ?? null,
  photos: row.photos.map((p) => ({ ...presentFile(p.file), sortOrder: p.sortOrder })),
  units: naturalUnitOrder(row.units),
  services: row.services.map(presentService),
});

/** Equipment of the caller's provider, or 404. */
async function ownedEquipment(tx: Tx | typeof database, providerId: string, id: string) {
  const equipment = await tx.equipment.findFirst({
    where: { id, providerId },
    select: {
      id: true,
      categoryId: true,
      status: true,
      category: { select: { requiresPilotLicence: true } },
    },
  });
  if (!equipment) throw notFound();
  return equipment;
}
async function loadDetail(providerId: string, id: string) {
  const row = await database.equipment.findFirst({
    where: { id, providerId },
    select: detailSelect,
  });
  if (!row) throw notFound();
  return presentDetail(row);
}
const audited = (
  tx: Tx,
  details: RequestDetails,
  user: UserSummary,
  action: string,
  equipmentId: string,
  metadata?: Prisma.InputJsonObject,
) =>
  audit(tx, details, action, user.id, { entityType: "equipment", entityId: equipmentId, metadata });

/* -------------------------------- equipment -------------------------------- */

export async function listEquipment(user: UserSummary) {
  const providerId = await providerIdOfUser(user.id);
  const rows = await database.equipment.findMany({
    where: { providerId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      status: true,
      category: categorySelect,
      photos: { ...photoSelect, take: 1 },
      units: { select: unitSelect },
      _count: { select: { units: true, services: { where: { isActive: true } } } },
    },
  });
  return rows.map(({ photos, _count, units, ...row }) => ({
    ...row,
    units: naturalUnitOrder(units),
    firstPhoto: photos[0] ? presentFile(photos[0].file) : null,
    unitCount: _count.units,
    serviceCount: _count.services,
  }));
}
export async function getEquipment(user: UserSummary, id: string) {
  return loadDetail(await providerIdOfUser(user.id), id);
}

export async function createEquipment(
  user: UserSummary,
  input: CreateEquipmentInput,
  details: RequestDetails,
) {
  const created = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    const category = await tx.serviceCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) throw invalid("categoryId", "Unknown category.");
    const equipment = await tx.equipment.create({
      data: {
        providerId: provider.id,
        categoryId: category.id,
        make: input.make,
        model: input.model,
        year: input.year,
        capacityValue: input.capacityValue,
        capacityUnit: input.capacityUnit,
        implements: input.implements ?? [],
      },
      select: { id: true },
    });
    await tx.equipmentUnit.createMany({
      data: Array.from({ length: input.numberOfUnits }, (_, i) => ({
        equipmentId: equipment.id,
        unitLabel: "Unit " + (i + 1),
      })),
    });
    for (const [index, fileId] of input.photoFileIds.entries()) {
      await attachFile(tx, {
        fileId,
        userId: user.id,
        bucket: "EQUIPMENT_PHOTO",
        entityType: "equipment",
        entityId: equipment.id,
      });
      await tx.equipmentPhoto.create({
        data: { equipmentId: equipment.id, fileId, sortOrder: index },
      });
    }
    await audited(tx, details, user, "EQUIPMENT_CREATED", equipment.id, {
      categoryId: category.id,
      units: input.numberOfUnits,
    });
    return { providerId: provider.id, id: equipment.id };
  });
  return loadDetail(created.providerId, created.id);
}
export async function updateEquipment(
  user: UserSummary,
  id: string,
  input: UpdateEquipmentInput,
  details: RequestDetails,
) {
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    const current = await tx.equipment.findFirst({
      where: { id, providerId: provider.id },
      select: { id: true, capacityValue: true, capacityUnit: true },
    });
    if (!current) throw notFound();
    if (input.categoryId) {
      const category = await tx.serviceCategory.findFirst({
        where: { id: input.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) throw invalid("categoryId", "Unknown category.");
      const changed = await tx.equipment.count({
        where: { id, categoryId: { not: input.categoryId } },
      });
      if (changed) {
        // A category change would orphan services, drone UINs and equipment documents.
        const dependants =
          (await tx.equipmentService.count({ where: { equipmentId: id } })) +
          (await tx.providerDocument.count({ where: { equipmentId: id } }));
        if (dependants)
          throw invalid(
            "categoryId",
            "Remove this equipment's services and documents before changing its category.",
            409,
            "INVALID_STATE",
          );
      }
    }
    const value = input.capacityValue === undefined ? current.capacityValue : input.capacityValue;
    const unit = input.capacityUnit === undefined ? current.capacityUnit : input.capacityUnit;
    if ((value == null) !== (unit == null))
      throw invalid("capacityUnit", "Provide both the capacity and its unit, or neither.");
    await tx.equipment.update({ where: { id }, data: input });
    await audited(tx, details, user, "EQUIPMENT_UPDATED", id, { fields: Object.keys(input) });
    return provider.id;
  });
  return loadDetail(providerId, id);
}
async function setEquipmentStatus(
  user: UserSummary,
  id: string,
  status: "ACTIVE" | "INACTIVE",
  details: RequestDetails,
) {
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    await ownedEquipment(tx, provider.id, id);
    await tx.equipment.update({ where: { id }, data: { status } });
    await audited(
      tx,
      details,
      user,
      status === "ACTIVE" ? "EQUIPMENT_ACTIVATED" : "EQUIPMENT_DEACTIVATED",
      id,
    );
    return provider.id;
  });
  return loadDetail(providerId, id);
}
export const activateEquipment = (u: UserSummary, id: string, d: RequestDetails) =>
  setEquipmentStatus(u, id, "ACTIVE", d);
export const deactivateEquipment = (u: UserSummary, id: string, d: RequestDetails) =>
  setEquipmentStatus(u, id, "INACTIVE", d);

/** Ordered photo set: kept ids stay, new ids are attached, removed ids are soft-deleted. */
export async function setPhotos(
  user: UserSummary,
  id: string,
  fileIds: string[],
  details: RequestDetails,
) {
  const providerId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    await ownedEquipment(tx, provider.id, id);
    const current = await tx.equipmentPhoto.findMany({
      where: { equipmentId: id },
      select: { fileId: true },
    });
    const have = new Set(current.map((p) => p.fileId));
    const wanted = new Set(fileIds);
    for (const photo of current)
      if (!wanted.has(photo.fileId)) {
        await tx.equipmentPhoto.delete({
          where: { equipmentId_fileId: { equipmentId: id, fileId: photo.fileId } },
        });
        await detachAndDelete(tx, photo.fileId);
      }
    for (const [index, fileId] of fileIds.entries()) {
      if (have.has(fileId)) {
        await tx.equipmentPhoto.update({
          where: { equipmentId_fileId: { equipmentId: id, fileId } },
          data: { sortOrder: index },
        });
      } else {
        await attachFile(tx, {
          fileId,
          userId: user.id,
          bucket: "EQUIPMENT_PHOTO",
          entityType: "equipment",
          entityId: id,
        });
        await tx.equipmentPhoto.create({ data: { equipmentId: id, fileId, sortOrder: index } });
      }
    }
    await audited(tx, details, user, "EQUIPMENT_PHOTOS_UPDATED", id, { count: fileIds.length });
    return provider.id;
  });
  return (await loadDetail(providerId, id)).photos;
}

/* ---------------------------------- units ---------------------------------- */

export async function listUnits(user: UserSummary, equipmentId: string) {
  const providerId = await providerIdOfUser(user.id);
  await ownedEquipment(database, providerId, equipmentId);
  return naturalUnitOrder(
    await database.equipmentUnit.findMany({ where: { equipmentId }, select: unitSelect }),
  );
}
export async function addUnits(
  user: UserSummary,
  equipmentId: string,
  count: number,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    await ownedEquipment(tx, provider.id, equipmentId);
    const existing = await tx.equipmentUnit.findMany({
      where: { equipmentId },
      select: { unitLabel: true },
    });
    if (existing.length + count > MAX_UNITS)
      throw invalid(
        "count",
        "An equipment can have at most " + MAX_UNITS + " units.",
        422,
        "UNIT_LIMIT",
      );
    const next = Math.max(0, ...existing.map((u) => unitNumber(u.unitLabel)));
    await tx.equipmentUnit.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        equipmentId,
        unitLabel: "Unit " + (next + i + 1),
      })),
    });
    await audited(tx, details, user, "EQUIPMENT_UNITS_ADDED", equipmentId, { count });
  });
  return listUnits(user, equipmentId);
}
export async function updateUnit(
  user: UserSummary,
  equipmentId: string,
  unitId: string,
  input: UpdateUnitInput,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    const equipment = await ownedEquipment(tx, provider.id, equipmentId);
    const unit = await tx.equipmentUnit.findFirst({
      where: { id: unitId, equipmentId },
      select: { id: true },
    });
    if (!unit) throw notFound();
    if (input.droneUin != null && !equipment.category.requiresPilotLicence)
      throw invalid("droneUin", "A drone UIN applies only to drone equipment.");
    await tx.equipmentUnit.update({ where: { id: unitId }, data: input });
    await audited(tx, details, user, "EQUIPMENT_UNIT_UPDATED", equipmentId, {
      unitId,
      fields: Object.keys(input),
    });
  });
  return (await listUnits(user, equipmentId)).find((u) => u.id === unitId)!;
}

/* --------------------------------- services -------------------------------- */

async function operationAllowed(tx: Tx, categoryId: string, operationId: string) {
  const mapped = await tx.categoryOperation.findFirst({
    where: { categoryId, operationId, operation: { isActive: true } },
    select: { operationId: true },
  });
  if (!mapped) throw invalid("operationId", "That operation is not offered for this category.");
}
export async function listServices(user: UserSummary, equipmentId: string) {
  const providerId = await providerIdOfUser(user.id);
  await ownedEquipment(database, providerId, equipmentId);
  const rows = await database.equipmentService.findMany({
    where: { equipmentId },
    select: serviceSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(presentService);
}
const dataOf = (input: ServiceInput) => ({
  pricingBasis: input.pricingBasis,
  ratePaise: input.ratePaise,
  minChargePaise: input.minChargePaise,
  travelMode: input.travelMode,
  travelFlatPaise: input.travelMode === "FLAT" ? input.travelFlatPaise : null,
  travelPerKmPaise: input.travelMode === "PER_KM" ? input.travelPerKmPaise : null,
  freeRadiusKm: input.travelMode === "PER_KM" ? (input.freeRadiusKm ?? 0) : null,
  workRateAcresPerHour: input.workRateAcresPerHour,
});
export async function createService(
  user: UserSummary,
  equipmentId: string,
  input: ServiceInput,
  details: RequestDetails,
) {
  const serviceId = await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    const equipment = await ownedEquipment(tx, provider.id, equipmentId);
    await operationAllowed(tx, equipment.categoryId, input.operationId);
    await assertWithinRateCap(tx, {
      categoryId: equipment.categoryId,
      operationId: input.operationId,
      districtId: provider.districtId,
      pricingBasis: input.pricingBasis,
      ratePaise: input.ratePaise,
    });
    const existing = await tx.equipmentService.findUnique({
      where: { equipmentId_operationId: { equipmentId, operationId: input.operationId } },
      select: { id: true, isActive: true },
    });
    if (existing?.isActive)
      throw invalid(
        "operationId",
        "This operation is already on the rate card.",
        409,
        "SERVICE_EXISTS",
      );
    // A previously removed (inactive) service is revived with the new terms.
    const service = existing
      ? await tx.equipmentService.update({
          where: { id: existing.id },
          data: { ...dataOf(input), isActive: true },
          select: { id: true },
        })
      : await tx.equipmentService.create({
          data: { equipmentId, operationId: input.operationId, ...dataOf(input) },
          select: { id: true },
        });
    await audited(tx, details, user, "EQUIPMENT_SERVICE_SAVED", equipmentId, {
      serviceId: service.id,
      operationId: input.operationId,
    });
    return service.id;
  });
  return presentService(
    await database.equipmentService.findUniqueOrThrow({
      where: { id: serviceId },
      select: serviceSelect,
    }),
  );
}
export async function updateService(
  user: UserSummary,
  equipmentId: string,
  serviceId: string,
  patch: ServicePatch,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    const equipment = await ownedEquipment(tx, provider.id, equipmentId);
    const row = await tx.equipmentService.findFirst({
      where: { id: serviceId, equipmentId, isActive: true },
    });
    if (!row) throw notFound();
    const modeChanged = patch.travelMode !== undefined && patch.travelMode !== row.travelMode;
    // Merge onto the stored values (null clears a field), then validate the complete record.
    const pick = <T>(next: T | null | undefined, old: T | null, reset: boolean): T | undefined =>
      next === null
        ? undefined
        : next !== undefined
          ? next
          : reset
            ? undefined
            : (old ?? undefined);
    const merged = serviceSchema.safeParse({
      operationId: row.operationId,
      pricingBasis: patch.pricingBasis ?? row.pricingBasis,
      ratePaise: patch.ratePaise ?? row.ratePaise,
      minChargePaise: patch.minChargePaise ?? row.minChargePaise,
      travelMode: patch.travelMode ?? row.travelMode,
      travelFlatPaise: pick(patch.travelFlatPaise, row.travelFlatPaise, modeChanged),
      travelPerKmPaise: pick(patch.travelPerKmPaise, row.travelPerKmPaise, modeChanged),
      freeRadiusKm: pick(patch.freeRadiusKm, row.freeRadiusKm?.toNumber() ?? null, modeChanged),
      workRateAcresPerHour: patch.workRateAcresPerHour ?? row.workRateAcresPerHour.toNumber(),
    });
    if (!merged.success)
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "Validation failed.",
        merged.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    // A cap applies to what is being charged, so it is checked only when the rate or the pricing
    // basis changes. Otherwise a legacy rate set before the cap existed would block unrelated edits.
    if (merged.data.ratePaise !== row.ratePaise || merged.data.pricingBasis !== row.pricingBasis)
      await assertWithinRateCap(tx, {
        categoryId: equipment.categoryId,
        operationId: row.operationId,
        districtId: provider.districtId,
        pricingBasis: merged.data.pricingBasis,
        ratePaise: merged.data.ratePaise,
      });
    await tx.equipmentService.update({ where: { id: serviceId }, data: dataOf(merged.data) });
    await audited(tx, details, user, "EQUIPMENT_SERVICE_SAVED", equipmentId, { serviceId });
  });
  return presentService(
    await database.equipmentService.findUniqueOrThrow({
      where: { id: serviceId },
      select: serviceSelect,
    }),
  );
}
export async function removeService(
  user: UserSummary,
  equipmentId: string,
  serviceId: string,
  details: RequestDetails,
) {
  await database.$transaction(async (tx) => {
    const provider = await lockOwnProvider(tx, user.id);
    assertProviderEditable(provider, "equipment");
    await ownedEquipment(tx, provider.id, equipmentId);
    const result = await tx.equipmentService.updateMany({
      where: { id: serviceId, equipmentId, isActive: true },
      data: { isActive: false },
    });
    if (result.count !== 1) throw notFound();
    await audited(tx, details, user, "EQUIPMENT_SERVICE_REMOVED", equipmentId, { serviceId });
  });
}
