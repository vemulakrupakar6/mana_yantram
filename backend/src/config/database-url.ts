import { z } from "zod";

const connectionFields = z.object({
  DB_HOST: z.union([z.hostname(), z.ipv4(), z.ipv6()]),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
});

function buildDatabaseUrl(name: string) {
  const fields = connectionFields.safeParse(process.env);
  if (!fields.success) {
    const keys = fields.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error("Missing or invalid database settings: " + keys);
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = fields.data;
  const host = DB_HOST.includes(":") ? `[${DB_HOST}]` : DB_HOST;
  return `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${host}:${DB_PORT}/${encodeURIComponent(name)}`;
}

export function getDatabaseUrl() {
  const { DATABASE_URL, DB_NAME } = process.env;
  return DATABASE_URL || (DB_NAME ? buildDatabaseUrl(DB_NAME) : undefined);
}

export function getTestDatabaseUrl() {
  const { TEST_DATABASE_URL, DB_TEST_NAME } = process.env;
  const target = TEST_DATABASE_URL || (DB_TEST_NAME ? buildDatabaseUrl(DB_TEST_NAME) : undefined);
  const test = target ? URL.parse(target) : null;
  const currentUrl = getDatabaseUrl();
  const current = currentUrl ? URL.parse(currentUrl) : null;
  const sameDatabase =
    test &&
    current &&
    test.hostname.toLowerCase() === current.hostname.toLowerCase() &&
    (test.port || "5432") === (current.port || "5432") &&
    test.pathname === current.pathname;
  if (!target || !test?.pathname.endsWith("_test") || sameDatabase) {
    throw new Error("Set DB_TEST_NAME to a separate PostgreSQL database whose name ends in _test.");
  }
  return target;
}
