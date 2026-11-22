import { Router } from "express";
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
  success(res, "Database is ready.", { status: "ready" });
});
