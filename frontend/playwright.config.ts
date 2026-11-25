import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { getTestDatabaseUrl } from "../backend/src/config/database-url.js";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: fileURLToPath(new URL("../backend/.env", import.meta.url)), quiet: true });
// Computed once by the runner (the safety check rejects a DATABASE_URL that already points at the
// test database), then handed to the workers through E2E_DATABASE_URL.
const database = process.env.E2E_DATABASE_URL ?? getTestDatabaseUrl();
process.env.E2E_DATABASE_URL = database;
// Test helpers talk to the same (test) database the API under test uses, never the development one.
process.env.DATABASE_URL = database;
// Uploaded files from browser tests go to a throwaway folder, not backend/storage.
const storageRoot = join(tmpdir(), "mana-yantram-e2e-storage");
mkdirSync(storageRoot, { recursive: true }); // the API readiness check requires it to exist
const website = "http://localhost:5180";
const api = "http://localhost:5100/api/v1";
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 80_000,
  expect: { timeout: 10_000 },
  use: { ...devices["Desktop Chrome"], channel, baseURL: website, trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev:isolated -w backend",
      cwd: root,
      url: api + "/health/ready",
      timeout: 65_000,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: database,
        PORT: "5100",
        COOKIE_SECURE: "false",
        COOKIE_SAME_SITE: "lax",
        CORS_ORIGIN: website,
        // Long enough for multi-step flows; the auth spec waits this out to prove silent renewal.
        JWT_ACCESS_EXPIRES_IN: "15s",
        STORAGE_ROOT: storageRoot,
        SEED_DEMO_USERS: "false",
        LOG_LEVEL: "silent",
      },
    },
    {
      command: "npm run dev -w frontend -- --port 5180",
      cwd: root,
      url: website,
      timeout: 65_000,
      env: { VITE_API_BASE_URL: api, VITE_DASHBOARD_PREVIEW: "true" },
    },
  ],
});
