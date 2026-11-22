import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { getTestDatabaseUrl } from "../backend/src/config/database-url.js";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: fileURLToPath(new URL("../backend/.env", import.meta.url)), quiet: true });
const database = getTestDatabaseUrl();
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
        JWT_ACCESS_EXPIRES_IN: "4s",
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
