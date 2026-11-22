import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { protectCookieOperation } from "../../middleware/csrf.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { loginSchema, passwordSchema, registerSchema } from "./auth.schema.js";
import * as controller from "./auth.controller.js";

export const authRoutes = Router();
authRoutes.post(
  "/register",
  protectCookieOperation,
  validate(registerSchema),
  rateLimit("register", 20),
  controller.register,
);
authRoutes.post(
  "/login",
  protectCookieOperation,
  validate(loginSchema),
  rateLimit("login", 100, 5),
  controller.login,
);
authRoutes.post("/refresh", protectCookieOperation, rateLimit("refresh", 240), controller.refresh);
authRoutes.post("/logout", protectCookieOperation, controller.logout);
authRoutes.post("/logout-all", protectCookieOperation, authenticate, controller.logoutAll);
authRoutes.get("/me", authenticate, controller.me);
authRoutes.patch(
  "/change-password",
  protectCookieOperation,
  authenticate,
  validate(passwordSchema),
  rateLimit("password", 20),
  controller.changePassword,
);
