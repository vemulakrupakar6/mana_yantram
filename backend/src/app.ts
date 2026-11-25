import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { openApi } from "./config/swagger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { healthRoutes } from "./modules/health/health.routes.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { portalRoutes } from "./modules/rbac/portal.routes.js";
import {
  adminFarmersRoutes,
  assistedRoutes,
  farmersRoutes,
} from "./modules/farmers/farmers.routes.js";
import { equipmentRoutes } from "./modules/equipment/equipment.routes.js";
import { adminProvidersRoutes } from "./modules/admin-providers/admin-providers.routes.js";
import { availabilityRoutes } from "./modules/availability/availability.routes.js";
import {
  operatorSelfRoutes,
  providerOperatorsRoutes,
} from "./modules/operators/operators.routes.js";
import { rateCapAdminRoutes, rateCapHintRoutes } from "./modules/rate-caps/rate-caps.routes.js";
import { providersRoutes } from "./modules/providers/providers.routes.js";
import { filesRoutes } from "./modules/files/files.routes.js";
import { mastersRoutes } from "./modules/masters/masters.routes.js";
import { adminUsersRoutes } from "./modules/admin-users/admin-users.routes.js";

export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    strictTransportSecurity: env.NODE_ENV === "production",
  }),
);
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    serializers: {
      req: (req) => ({ method: req.method, path: req.url?.split("?")[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: (error) => ({ type: error.type }),
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) =>
      callback(null, Boolean(origin && env.CORS_ORIGIN.includes(origin))),
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Protection"],
  }),
);
app.use(
  express.json({ limit: "32kb" }),
  express.urlencoded({ extended: false, limit: "32kb" }),
  cookieParser(),
);
app.use("/api/v1", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/portals", portalRoutes);
app.use("/api/v1/masters/rate-cap", rateCapHintRoutes);
app.use("/api/v1/masters", mastersRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/v1/providers/me/equipment", equipmentRoutes);
app.use("/api/v1/providers/me/operators", providerOperatorsRoutes);
app.use("/api/v1/providers/me", availabilityRoutes);
app.use("/api/v1/providers", providersRoutes);
app.use("/api/v1/operator", operatorSelfRoutes);
app.use("/api/v1/farmers", farmersRoutes);
app.use("/api/v1/assisted/farmers", assistedRoutes);
app.use("/api/v1/admin/farmers", adminFarmersRoutes);
app.use("/api/v1/admin/providers", adminProvidersRoutes);
app.use("/api/v1/admin", rateCapAdminRoutes);
app.use("/api/v1/admin/users", adminUsersRoutes);
if (env.NODE_ENV === "development") {
  app.get("/api-docs/openapi.json", (_req, res) => {
    res.json(openApi);
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApi));
}
app.use(notFound, errorHandler);
