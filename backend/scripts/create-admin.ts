// Bootstrap the first SUPER_ADMIN:  npm run admin:create -w backend [-- --force]
// Reads BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD (12-128 chars).
import { randomUUID } from "node:crypto";

// Snapshot before dotenv loads (it never overrides variables already set in the shell).
const passwordFromShell = process.env.BOOTSTRAP_ADMIN_PASSWORD !== undefined;
const { database } = await import("../src/config/database.js");
const { env } = await import("../src/config/env.js");
const { hashPassword } = await import("../src/utils/password.js");
const { username: usernameSchema } = await import("../src/modules/auth/auth.schema.js");
const { z } = await import("zod");

const force = process.argv.includes("--force");
async function main() {
  const username = usernameSchema.safeParse(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "");
  const password = z.string().min(12).max(128).safeParse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  if (!username.success) throw new Error("BOOTSTRAP_ADMIN_USERNAME must be a valid username.");
  if (!password.success)
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain 12–128 characters.");
  if (!passwordFromShell) {
    if (env.NODE_ENV === "production")
      throw new Error(
        "In production, pass BOOTSTRAP_ADMIN_PASSWORD in the shell environment, not a .env file.",
      );
    console.warn(
      "Warning: the password was read from a .env file. Remove it once the admin exists.",
    );
  }
  const existing = await database.userRole.count({ where: { role: { code: "SUPER_ADMIN" } } });
  if (existing && !force)
    throw new Error("A SUPER_ADMIN already exists. Re-run with --force to create another.");
  if (await database.user.findUnique({ where: { username: username.data }, select: { id: true } }))
    throw new Error("That username already exists.");
  const role = await database.role.findUnique({ where: { code: "SUPER_ADMIN" } });
  if (!role) throw new Error("Roles are not seeded. Run `npm run db:seed -w backend` first.");
  const passwordHash = await hashPassword(password.data);
  await database.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: username.data,
        displayName: "Super Administrator",
        passwordHash,
        mustChangePassword: false,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await tx.userRoleOnboarding.create({
      data: { userId: user.id, roleId: role.id, status: "COMPLETED", completedAt: new Date() },
    });
    await tx.userJurisdiction.create({ data: { userId: user.id, level: "STATE" } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "BOOTSTRAP_ADMIN_CREATED",
        entityType: "user",
        entityId: user.id,
        requestId: randomUUID(),
      },
    });
  });
  console.log("Created SUPER_ADMIN '" + username.data + "'.");
}
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
