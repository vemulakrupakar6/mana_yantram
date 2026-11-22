import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { getTestDatabaseUrl } from "../src/config/database-url.js";

config({ quiet: true });
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SEED_DEMO_USERS = "false";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAME_SITE = "lax";
process.env.CORS_ORIGIN = "http://localhost:5173";

function run(tool: string, args: string[]) {
  try {
    execFileSync(process.execPath, [resolve("../node_modules", tool), ...args], { stdio: "pipe" });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "status" in error ? error.status : "unknown";
    throw new Error(
      "Test database setup failed during " +
        tool +
        " (exit " +
        code +
        "). Check the test database connection and deployment permissions.",
    );
  }
}
run("prisma/build/index.js", ["migrate", "deploy"]);
run("tsx/dist/cli.mjs", ["prisma/seed.ts"]);
