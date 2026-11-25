import { Prisma } from "@prisma/client";
import { database } from "../../config/database.js";
import { AppError } from "../../common/errors/app-error.js";
import { consentPurposes, policyVersion } from "../../common/constants/policies.js";
import { uniqueConstraint } from "../../utils/prisma-errors.js";
import { aadhaarTokens, maskAadhaar } from "../../utils/aadhaar.js";
import { hashPassword } from "../../utils/password.js";
import { audit, lockUser } from "../auth/auth.repository.js";
import type { RequestDetails, UserSummary } from "../auth/auth.types.js";
import { assertInJurisdiction, jurisdictionWhere } from "../rbac/jurisdiction.js";
import { assertLocationHierarchy } from "../masters/location.js";
import type {
  AssistedInput,
  FarmerProfileInput,
  FarmerProfilePatch,
  PlotInput,
  PlotPatch,
} from "./farmers.schema.js";

const MAX_PLOTS = 50;
const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found.");
const fieldError = (status: number, code: string, message: string, field: string) =>
  new AppError(status, code, message, [{ field, message }]);

const names = { select: { id: true, nameEn: true, nameTe: true } } as const;
const farmerSelect = {
  id: true,
  fullName: true,
  relationType: true,
  relativeName: true,
  gender: true,
  aadhaarLast4: true,
  isAadhaarVerified: true,
  notifySms: true,
  notifyInApp: true,
  notifyPush: true,
  registeredByUserId: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, username: true, mobile: true, preferredLanguage: true } },
  district: names,
  mandal: names,
  village: names,
  _count: { select: { plots: { where: { isActive: true } } } },
} satisfies Prisma.FarmerSelect;
type FarmerRow = Prisma.FarmerGetPayload<{ select: typeof farmerSelect }>;

/**
 * Read-back after the transaction has committed. Reads with relation joins and counts make Prisma
 * issue several queries at once, which a transaction's single connection must not receive.
 */
async function loadFarmer(id: string) {
  return presentFarmer(
    await database.farmer.findUniqueOrThrow({ where: { id }, select: farmerSelect }),
  );
}
export const maskMobile = (mobile: string | null) =>
  mobile ? mobile.slice(0, 2) + "XXXXXX" + mobile.slice(-2) : null;

export function presentFarmer(row: FarmerRow, options: { maskPhone?: boolean } = {}) {
  const mobile = row.user.mobile;
  return {
    id: row.id,
    username: row.user.username,
    fullName: row.fullName,
    relationType: row.relationType,
    relativeName: row.relativeName,
    gender: row.gender,
    mobile: options.maskPhone ? maskMobile(mobile) : mobile,
    preferredLanguage: row.user.preferredLanguage,
    district: row.district,
    mandal: row.mandal,
    village: row.village,
    aadhaar: { masked: maskAadhaar(row.aadhaarLast4), verified: row.isAadhaarVerified },
    notifications: { sms: row.notifySms, inApp: row.notifyInApp, push: row.notifyPush },
    assisted: row.registeredByUserId !== null,
    status: row.status,
    plotCount: row._count.plots,
    createdAt: row.createdAt,
  };
}
const plotSelect = {
  id: true,
  surveyNo: true,
  extentAcres: true,
  latitude: true,
  longitude: true,
  boundary: true,
  createdAt: true,
  village: {
    select: {
      id: true,
      nameEn: true,
      nameTe: true,
      mandalId: true,
      mandal: { select: { districtId: true } },
    },
  },
  crops: {
    select: {
      season: true,
      year: true,
      crop: { select: { id: true, code: true, nameEn: true, nameTe: true } },
    },
    orderBy: [{ year: "desc" }, { season: "asc" }],
  },
} satisfies Prisma.FarmerPlotSelect;
type PlotRow = Prisma.FarmerPlotGetPayload<{ select: typeof plotSelect }>;
const presentPlot = (row: PlotRow) => ({
  id: row.id,
  surveyNo: row.surveyNo,
  extentAcres: row.extentAcres.toFixed(2),
  latitude: row.latitude.toFixed(6),
  longitude: row.longitude.toFixed(6),
  boundary: row.boundary,
  village: {
    id: row.village.id,
    nameEn: row.village.nameEn,
    nameTe: row.village.nameTe,
    mandalId: row.village.mandalId,
    districtId: row.village.mandal.districtId,
  },
  crops: row.crops.map(({ crop, season, year }) => ({ crop, season, year })),
  createdAt: row.createdAt,
});

function uniqueViolation(error: unknown) {
  const target = uniqueConstraint(error);
  if (target === null) return null;
  if (target.includes("aadhaar")) return "aadhaar";
  if (target.includes("mobile")) return "mobile";
  if (target.includes("username")) return "username";
  return "other";
}
function translateUnique(error: unknown): never {
  const kind = uniqueViolation(error);
  if (kind === "aadhaar")
    throw fieldError(
      409,
      "AADHAAR_TAKEN",
      "That Aadhaar number is already registered.",
      "aadhaarNumber",
    );
  if (kind === "mobile")
    throw fieldError(409, "MOBILE_TAKEN", "That mobile number is already in use.", "mobile");
  if (kind === "username")
    throw fieldError(409, "USERNAME_TAKEN", "That username is already taken.", "username");
  throw error;
}
const lockFarmer = (tx: Prisma.TransactionClient, id: string) =>
  tx.$queryRaw`SELECT id FROM farmers WHERE id = ${id}::uuid FOR UPDATE`;

async function assertPlotRefs(
  tx: Prisma.TransactionClient,
  input: { villageId?: string; crops?: PlotInput["crops"] },
) {
  if (input.villageId) {
    const village = await tx.village.findFirst({
      where: { id: input.villageId, isActive: true },
      select: { id: true },
    });
    if (!village) throw fieldError(422, "VALIDATION_ERROR", "Unknown village.", "villageId");
  }
  if (input.crops?.length) {
    const ids = [...new Set(input.crops.map((c) => c.cropId))];
    const found = await tx.crop.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) throw fieldError(422, "VALIDATION_ERROR", "Unknown crop.", "crops");
  }
}
const cropRows = (plotId: string, crops: PlotInput["crops"]) =>
  crops.map((c) => ({ plotId, cropId: c.cropId, season: c.season, year: c.year }));
const boundaryValue = (boundary: PlotInput["boundary"]) =>
  boundary ? (boundary as unknown as Prisma.InputJsonValue) : undefined;

async function farmerOfUser(
  userId: string,
  tx: Prisma.TransactionClient | typeof database = database,
) {
  const farmer = await tx.farmer.findUnique({ where: { userId }, select: { id: true } });
  if (!farmer) throw new AppError(409, "PROFILE_REQUIRED", "Complete your farmer profile first.");
  return farmer;
}

/* ------------------------------ self service ------------------------------ */

export async function createOwnProfile(
  user: UserSummary,
  input: FarmerProfileInput,
  details: RequestDetails,
) {
  try {
    return await database
      .$transaction(async (tx) => {
        const account = await lockUser(tx, user.id);
        if (!account || account.status !== "ACTIVE")
          throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
        if (await tx.farmer.findUnique({ where: { userId: user.id }, select: { id: true } }))
          throw new AppError(409, "PROFILE_EXISTS", "Your farmer profile already exists.");
        await assertLocationHierarchy(tx, input);
        await tx.user.update({
          where: { id: user.id },
          data: {
            mobile: input.mobile,
            mobileVerified: false,
            preferredLanguage: input.preferredLanguage,
            displayName: input.fullName,
          },
        });
        const tokens = input.aadhaarNumber ? aadhaarTokens(input.aadhaarNumber) : null;
        const farmer = await tx.farmer.create({
          data: {
            userId: user.id,
            fullName: input.fullName,
            relationType: input.relationType,
            relativeName: input.relativeName,
            gender: input.gender,
            districtId: input.districtId,
            mandalId: input.mandalId,
            villageId: input.villageId,
            aadhaarLast4: tokens?.last4,
            aadhaarHash: tokens?.hash,
            notifySms: input.notifications.sms,
            notifyInApp: input.notifications.inApp,
            notifyPush: input.notifications.push,
          },
          select: { id: true },
        });
        const role = await tx.role.findUniqueOrThrow({ where: { code: "FARMER" } });
        await tx.userRoleOnboarding.updateMany({
          where: { userId: user.id, roleId: role.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await audit(tx, details, "FARMER_PROFILE_CREATED", user.id, {
          entityType: "farmer",
          entityId: farmer.id,
        });
        return farmer.id;
      })
      .then(loadFarmer);
  } catch (error) {
    return translateUnique(error);
  }
}
export async function getOwnProfile(user: UserSummary) {
  const row = await database.farmer.findUnique({
    where: { userId: user.id },
    select: farmerSelect,
  });
  if (!row) throw new AppError(409, "PROFILE_REQUIRED", "Complete your farmer profile first.");
  return presentFarmer(row);
}
export async function updateOwnProfile(
  user: UserSummary,
  input: FarmerProfilePatch,
  details: RequestDetails,
) {
  try {
    return await database
      .$transaction(async (tx) => {
        const account = await lockUser(tx, user.id);
        if (!account || account.status !== "ACTIVE")
          throw new AppError(401, "INVALID_SESSION", "Sign in to continue.");
        const current = await tx.farmer.findUnique({
          where: { userId: user.id },
          select: { id: true, districtId: true, mandalId: true, villageId: true },
        });
        if (!current)
          throw new AppError(409, "PROFILE_REQUIRED", "Complete your farmer profile first.");
        const location = {
          districtId: input.districtId ?? current.districtId,
          mandalId: input.mandalId ?? current.mandalId,
          villageId: input.villageId ?? current.villageId,
        };
        if (input.districtId) await assertLocationHierarchy(tx, location);
        if (input.mobile !== undefined || input.preferredLanguage || input.fullName) {
          const old = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { mobile: true },
          });
          await tx.user.update({
            where: { id: user.id },
            data: {
              mobile: input.mobile,
              mobileVerified:
                input.mobile !== undefined && input.mobile !== old.mobile ? false : undefined,
              preferredLanguage: input.preferredLanguage,
              displayName: input.fullName,
            },
          });
        }
        const aadhaar =
          input.aadhaarNumber === undefined
            ? {}
            : input.aadhaarNumber === null
              ? { aadhaarLast4: null, aadhaarHash: null, isAadhaarVerified: false }
              : (() => {
                  const tokens = aadhaarTokens(input.aadhaarNumber);
                  return { aadhaarLast4: tokens.last4, aadhaarHash: tokens.hash };
                })();
        await tx.farmer.update({
          where: { id: current.id },
          data: {
            fullName: input.fullName,
            relationType: input.relationType,
            relativeName: input.relativeName,
            gender: input.gender,
            ...location,
            ...aadhaar,
            notifySms: input.notifications?.sms,
            notifyInApp: input.notifications?.inApp,
            notifyPush: input.notifications?.push,
          },
        });
        await audit(tx, details, "FARMER_PROFILE_UPDATED", user.id, {
          entityType: "farmer",
          entityId: current.id,
          metadata: { fields: Object.keys(input).filter((key) => key !== "aadhaarNumber") },
        });
        return current.id;
      })
      .then(loadFarmer);
  } catch (error) {
    return translateUnique(error);
  }
}

/* --------------------------------- plots ---------------------------------- */

async function createPlotFor(tx: Prisma.TransactionClient, farmerId: string, input: PlotInput) {
  await lockFarmer(tx, farmerId);
  if ((await tx.farmerPlot.count({ where: { farmerId, isActive: true } })) >= MAX_PLOTS)
    throw new AppError(422, "PLOT_LIMIT", "You can keep at most " + MAX_PLOTS + " plots.");
  await assertPlotRefs(tx, input);
  const plot = await tx.farmerPlot.create({
    data: {
      farmerId,
      surveyNo: input.surveyNo,
      extentAcres: input.extentAcres,
      villageId: input.villageId,
      latitude: input.latitude,
      longitude: input.longitude,
      boundary: boundaryValue(input.boundary),
    },
    select: { id: true },
  });
  if (input.crops.length) await tx.plotCrop.createMany({ data: cropRows(plot.id, input.crops) });
  return tx.farmerPlot.findUniqueOrThrow({ where: { id: plot.id }, select: plotSelect });
}
export async function listPlots(farmerId: string) {
  const rows = await database.farmerPlot.findMany({
    where: { farmerId, isActive: true },
    select: plotSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(presentPlot);
}
export async function listOwnPlots(user: UserSummary) {
  return listPlots((await farmerOfUser(user.id)).id);
}
export async function createOwnPlot(user: UserSummary, input: PlotInput, details: RequestDetails) {
  const farmer = await farmerOfUser(user.id);
  return database.$transaction(async (tx) => {
    const plot = await createPlotFor(tx, farmer.id, input);
    await audit(tx, details, "PLOT_CREATED", user.id, { entityType: "plot", entityId: plot.id });
    return presentPlot(plot);
  });
}
export async function getOwnPlot(user: UserSummary, plotId: string) {
  const farmer = await farmerOfUser(user.id);
  const plot = await database.farmerPlot.findFirst({
    where: { id: plotId, farmerId: farmer.id, isActive: true },
    select: plotSelect,
  });
  if (!plot) throw notFound();
  return presentPlot(plot);
}
export async function updateOwnPlot(
  user: UserSummary,
  plotId: string,
  input: PlotPatch,
  details: RequestDetails,
) {
  const farmer = await farmerOfUser(user.id);
  return database.$transaction(async (tx) => {
    await lockFarmer(tx, farmer.id);
    const existing = await tx.farmerPlot.findFirst({
      where: { id: plotId, farmerId: farmer.id, isActive: true },
      select: { id: true },
    });
    if (!existing) throw notFound();
    await assertPlotRefs(tx, input);
    await tx.farmerPlot.update({
      where: { id: plotId },
      data: {
        surveyNo: input.surveyNo,
        extentAcres: input.extentAcres,
        villageId: input.villageId,
        latitude: input.latitude,
        longitude: input.longitude,
        boundary: boundaryValue(input.boundary),
      },
    });
    if (input.crops) {
      // The supplied list replaces the full set.
      await tx.plotCrop.deleteMany({ where: { plotId } });
      if (input.crops.length) await tx.plotCrop.createMany({ data: cropRows(plotId, input.crops) });
    }
    await audit(tx, details, "PLOT_UPDATED", user.id, { entityType: "plot", entityId: plotId });
    return presentPlot(
      await tx.farmerPlot.findUniqueOrThrow({ where: { id: plotId }, select: plotSelect }),
    );
  });
}
export async function deleteOwnPlot(user: UserSummary, plotId: string, details: RequestDetails) {
  const farmer = await farmerOfUser(user.id);
  await database.$transaction(async (tx) => {
    const result = await tx.farmerPlot.updateMany({
      where: { id: plotId, farmerId: farmer.id, isActive: true },
      data: { isActive: false },
    });
    if (result.count !== 1) throw notFound();
    await audit(tx, details, "PLOT_DELETED", user.id, { entityType: "plot", entityId: plotId });
  });
}

/* ---------------------------- assisted registration ---------------------------- */

export async function registerAssisted(
  agent: UserSummary,
  input: AssistedInput,
  details: RequestDetails,
) {
  const { profile } = input;
  // Validate the data first (422), then the caller's authority over that location (403).
  await assertLocationHierarchy(database, profile);
  assertInJurisdiction(agent, { districtId: profile.districtId, mandalId: profile.mandalId });
  const passwordHash = await hashPassword(input.account.temporaryPassword);
  try {
    return await database
      .$transaction(async (tx) => {
        const role = await tx.role.findUnique({ where: { code: "FARMER" }, select: { id: true } });
        if (!role) throw new AppError(503, "ROLE_UNAVAILABLE", "Registration is unavailable.");
        const user = await tx.user.create({
          data: {
            username: input.account.username,
            passwordHash,
            displayName: profile.fullName,
            mobile: profile.mobile,
            preferredLanguage: profile.preferredLanguage,
            mustChangePassword: true,
            createdById: agent.id,
          },
          select: { id: true },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await tx.userRoleOnboarding.create({
          data: { userId: user.id, roleId: role.id, status: "COMPLETED", completedAt: new Date() },
        });
        await tx.consent.createMany({
          data: (["TERMS_OF_USE", "PRIVACY_NOTICE"] as const).map((consentType) => ({
            userId: user.id,
            consentType,
            documentVersion: policyVersion,
            language: profile.preferredLanguage,
            purposes: [...consentPurposes],
            capturedById: agent.id,
          })),
        });
        const tokens = profile.aadhaarNumber ? aadhaarTokens(profile.aadhaarNumber) : null;
        const farmer = await tx.farmer.create({
          data: {
            userId: user.id,
            fullName: profile.fullName,
            relationType: profile.relationType,
            relativeName: profile.relativeName,
            gender: profile.gender,
            districtId: profile.districtId,
            mandalId: profile.mandalId,
            villageId: profile.villageId,
            aadhaarLast4: tokens?.last4,
            aadhaarHash: tokens?.hash,
            notifySms: profile.notifications.sms,
            notifyInApp: profile.notifications.inApp,
            notifyPush: profile.notifications.push,
            registeredByUserId: agent.id,
          },
          select: { id: true },
        });
        for (const plot of input.plots ?? []) await createPlotFor(tx, farmer.id, plot);
        await audit(tx, details, "FARMER_ASSISTED_REGISTERED", agent.id, {
          entityType: "farmer",
          entityId: farmer.id,
          metadata: { plots: input.plots?.length ?? 0 },
        });
        // The temporary password is never echoed; the username lets the agent hand over credentials.
        return farmer.id;
      })
      .then(loadFarmer);
  } catch (error) {
    return translateUnique(error);
  }
}
const searchWhere = (search?: string): Prisma.FarmerWhereInput =>
  search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { user: { username: { contains: search, mode: "insensitive" } } },
          { user: { mobile: { contains: search } } },
        ],
      }
    : {};

async function page(
  where: Prisma.FarmerWhereInput,
  pageNo: number,
  pageSize: number,
  maskPhone: boolean,
) {
  const [total, rows] = await Promise.all([
    database.farmer.count({ where }),
    database.farmer.findMany({
      where,
      select: farmerSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (pageNo - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => presentFarmer(row, { maskPhone })),
    page: pageNo,
    pageSize,
    total,
  };
}
export function listAssisted(
  agent: UserSummary,
  query: { search?: string; page: number; pageSize: number },
) {
  return page(
    { AND: [{ registeredByUserId: agent.id }, searchWhere(query.search)] },
    query.page,
    query.pageSize,
    false,
  );
}
async function assistedFarmer(agent: UserSummary, id: string) {
  const row = await database.farmer.findFirst({
    where: { id, registeredByUserId: agent.id },
    select: farmerSelect,
  });
  if (!row) throw notFound();
  return row;
}
export async function getAssisted(agent: UserSummary, id: string) {
  const row = await assistedFarmer(agent, id);
  return { ...presentFarmer(row), plots: await listPlots(row.id) };
}
export async function addAssistedPlot(
  agent: UserSummary,
  id: string,
  input: PlotInput,
  details: RequestDetails,
) {
  await assistedFarmer(agent, id);
  return database.$transaction(async (tx) => {
    const plot = await createPlotFor(tx, id, input);
    await audit(tx, details, "PLOT_CREATED", agent.id, { entityType: "plot", entityId: plot.id });
    return presentPlot(plot);
  });
}

/* ------------------------------- officer views ------------------------------- */

/** Jurisdiction scope for officers. Field agents only ever see farmers they registered. */
function officerScope(user: UserSummary): Prisma.FarmerWhereInput {
  const scope: Prisma.FarmerWhereInput = jurisdictionWhere(user);
  return user.roles.includes("FIELD_AGENT")
    ? { AND: [scope, { registeredByUserId: user.id }] }
    : scope;
}
const helpdeskMasks = (user: UserSummary) => user.roles.includes("HELPDESK");

export function listForOfficer(
  user: UserSummary,
  query: {
    districtId?: string;
    mandalId?: string;
    villageId?: string;
    search?: string;
    assisted?: "true" | "false";
    page: number;
    pageSize: number;
  },
) {
  return page(
    {
      AND: [
        officerScope(user),
        query.districtId ? { districtId: query.districtId } : {},
        query.mandalId ? { mandalId: query.mandalId } : {},
        query.villageId ? { villageId: query.villageId } : {},
        query.assisted === undefined
          ? {}
          : { registeredByUserId: query.assisted === "true" ? { not: null } : null },
        searchWhere(query.search),
      ],
    },
    query.page,
    query.pageSize,
    helpdeskMasks(user),
  );
}
export async function getForOfficer(user: UserSummary, id: string) {
  const row = await database.farmer.findFirst({
    where: { AND: [{ id }, officerScope(user)] },
    select: farmerSelect,
  });
  if (!row) throw notFound();
  return {
    ...presentFarmer(row, { maskPhone: helpdeskMasks(user) }),
    plots: await listPlots(row.id),
  };
}
