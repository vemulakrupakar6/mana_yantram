import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import { env } from "../../config/env.js";
import { database } from "../../config/database.js";
import { success } from "../../common/responses/success.js";
import { AppError } from "../../common/errors/app-error.js";

export const healthRoutes = Router();
healthRoutes.get("/", (_req, res) => {
  success(res, "API is running.", { status: "ok" });
});
healthRoutes.get("/ready", async (_req, res) => {
  try {
    await database.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError(503, "DATABASE_UNAVAILABLE", "PostgreSQL is unavailable.");
  }
  try {
    await access(resolve(env.STORAGE_ROOT), constants.R_OK | constants.W_OK);
  } catch {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "File storage is unavailable.");
  }
  success(res, "Database is ready.", { status: "ready" });
});
