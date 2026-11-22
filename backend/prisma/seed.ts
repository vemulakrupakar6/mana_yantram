import { z } from "zod";
import { database } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { departmentRoles, portalPermissions, roleNames } from "../src/modules/rbac/roles.js";
import { hashPassword } from "../src/utils/password.js";
import type { RoleCode } from "@prisma/client";

const grants = Object.entries(portalPermissions);
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
] as const;

async function seed() {
  const demoPasswords = env.SEED_DEMO_USERS
    ? demoUsers.map(([, , , key]) => {
        const result = z.string().min(12).max(128).safeParse(process.env[key]);
        if (!result.success) throw new Error(key + " must contain 12–128 characters.");
        return result.data;
      })
    : [];
  await database.$transaction(async (tx) => {
    for (const [code, name] of Object.entries(roleNames) as Array<[RoleCode, string]>) {
      const description = "Mana Yantram " + name + " role.";
      const role = await tx.role.upsert({
        where: { code },
        create: { code, name, description },
        update: { name, description },
      });
      for (const [portal, permissionCode] of grants) {
        const description = "Access the " + portal.toLowerCase() + " portal.";
        const permission = await tx.permission.upsert({
          where: { code: permissionCode },
          update: { description },
          create: { code: permissionCode, description },
        });
        if (portal === code || (portal === "DEPARTMENT" && departmentRoles.includes(code))) {
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
            update: {},
            create: { roleId: role.id, permissionId: permission.id },
          });
        }
      }
    }
  });
  if (env.SEED_DEMO_USERS) {
    for (const [index, [username, displayName, code]] of demoUsers.entries()) {
      if (await database.user.findUnique({ where: { username }, select: { id: true } })) continue;
      const passwordHash = await hashPassword(demoPasswords[index]);
      await database.$transaction(async (tx) => {
        const role = await tx.role.findUniqueOrThrow({ where: { code } });
        const user = await tx.user.create({ data: { username, displayName, passwordHash } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await tx.userRoleOnboarding.create({ data: { userId: user.id, roleId: role.id } });
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
