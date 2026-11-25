import { z } from "zod";
import { database } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { resolve } from "node:path";
import { permissionDescriptions, rolePermissions, roleNames } from "../src/modules/rbac/roles.js";
import { categories, crops, documentTypes, operations } from "./masters-data.js";
import { importGeoCsv } from "../src/modules/masters/geo-import.js";
import { hashPassword } from "../src/utils/password.js";
import type { RoleCode } from "@prisma/client";

const demoUsers = [
  ["farmer_demo", "Demo Farmer", "FARMER", "DEMO_FARMER_PASSWORD"],
  ["provider_demo", "Demo Service Provider", "PROVIDER", "DEMO_PROVIDER_PASSWORD"],
  [
    "district_officer_demo",
    "Demo District Officer",
    "DISTRICT_OFFICER",
    "DEMO_DISTRICT_OFFICER_PASSWORD",
  ],
  ["state_admin_demo", "Demo State Administrator", "STATE_ADMIN", "DEMO_STATE_ADMIN_PASSWORD"],
  ["field_agent_demo", "Demo Field Agent", "FIELD_AGENT", "DEMO_FIELD_AGENT_PASSWORD"],
] as const;
const jurisdictionLevel: Partial<Record<RoleCode, "STATE" | "DISTRICT">> = {
  STATE_ADMIN: "STATE",
  SUPER_ADMIN: "STATE",
  DISTRICT_OFFICER: "DISTRICT",
  FIELD_AGENT: "DISTRICT",
};

async function seedMasters() {
  await database.$transaction(async (tx) => {
    for (const [index, type] of documentTypes.entries())
      await tx.documentType.upsert({
        where: { code: type.code },
        create: { ...type, sortOrder: index },
        update: { ...type, sortOrder: index },
      });
    for (const op of operations) {
      const data = {
        nameEn: op.nameEn,
        nameTe: op.nameTe,
        defaultPricingBasis: op.basis,
      };
      await tx.operation.upsert({
        where: { code: op.code },
        create: { code: op.code, ...data },
        update: data,
      });
    }
    for (const [index, cat] of categories.entries()) {
      const data = {
        nameEn: cat.nameEn,
        nameTe: cat.nameTe,
        requiresPilotLicence: cat.pilot,
        sortOrder: index,
      };
      const category = await tx.serviceCategory.upsert({
        where: { code: cat.code },
        create: { code: cat.code, ...data },
        update: data,
      });
      for (const code of cat.operations) {
        const operation = await tx.operation.findUniqueOrThrow({ where: { code } });
        await tx.categoryOperation.upsert({
          where: { categoryId_operationId: { categoryId: category.id, operationId: operation.id } },
          create: { categoryId: category.id, operationId: operation.id },
          update: {},
        });
      }
      for (const documentTypeCode of cat.documents)
        await tx.categoryDocumentType.upsert({
          where: { categoryId_documentTypeCode: { categoryId: category.id, documentTypeCode } },
          create: { categoryId: category.id, documentTypeCode },
          update: {},
        });
    }
    for (const [code, nameEn, nameTe] of crops)
      await tx.crop.upsert({
        where: { code },
        create: { code, nameEn, nameTe },
        update: { nameEn, nameTe },
      });
    // Created once; never overwritten so an admin's choice survives a re-seed.
    await tx.appSetting.upsert({
      where: { key: "rateCapsEnabled" },
      create: { key: "rateCapsEnabled", value: false },
      update: {},
    });
  });
}
async function seed() {
  const demoPasswords = env.SEED_DEMO_USERS
    ? demoUsers.map(([, , , key]) => {
        const result = z.string().min(12).max(128).safeParse(process.env[key]);
        if (!result.success) throw new Error(key + " must contain 12–128 characters.");
        return result.data;
      })
    : [];
  await database.$transaction(async (tx) => {
    const permissionIds = new Map<string, string>();
    for (const [code, description] of Object.entries(permissionDescriptions)) {
      const permission = await tx.permission.upsert({
        where: { code },
        update: { description },
        create: { code, description },
      });
      permissionIds.set(code, permission.id);
    }
    for (const [code, name] of Object.entries(roleNames) as Array<[RoleCode, string]>) {
      const description = "Mana Yantram " + name + " role.";
      const role = await tx.role.upsert({
        where: { code },
        create: { code, name, description },
        update: { name, description },
      });
      const wanted = new Set(
        rolePermissions[code].map((permission) => permissionIds.get(permission)!),
      );
      // Sync: remove stale grants, add missing ones.
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: [...wanted] } },
      });
      await tx.rolePermission.createMany({
        data: [...wanted].map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  });
  await seedMasters();
  // Sample geography (fake LGD codes prefixed "T") so dev and test work. Real data: db:import-geo.
  await importGeoCsv(resolve(import.meta.dirname, "data/geo.sample.csv"));
  if (env.SEED_DEMO_USERS) {
    const firstDistrict = await database.district.findFirstOrThrow({
      where: { lgdCode: "T001" },
      select: { id: true },
    });
    for (const [index, [username, displayName, code]] of demoUsers.entries()) {
      let user = await database.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) {
        const passwordHash = await hashPassword(demoPasswords[index]);
        user = await database.$transaction(async (tx) => {
          const role = await tx.role.findUniqueOrThrow({ where: { code } });
          const created = await tx.user.create({ data: { username, displayName, passwordHash } });
          await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
          await tx.userRoleOnboarding.create({ data: { userId: created.id, roleId: role.id } });
          return created;
        });
      }
      const level = jurisdictionLevel[code];
      if (level)
        await database.userJurisdiction.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            level,
            districtId: level === "DISTRICT" ? firstDistrict.id : null,
          },
          update: { level, districtId: level === "DISTRICT" ? firstDistrict.id : null },
        });
    }
  }
  console.log(
    "Roles and permissions seeded." +
      (env.SEED_DEMO_USERS ? " Optional demo accounts enabled." : ""),
  );
}
try {
  await seed();
} catch (error) {
  console.error(
    "Seed failed.",
    error instanceof Error && !error.message.includes("DEMO_")
      ? error.name
      : (error as Error).message,
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
