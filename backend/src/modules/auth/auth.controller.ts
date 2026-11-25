import type { Request, RequestHandler, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { success } from "../../common/responses/success.js";
import { clearRefreshCookie, refreshCookie, setRefreshCookie } from "../../utils/cookies.js";
import * as auth from "./auth.service.js";
import type { Session } from "./auth.types.js";

function requestDetails(req: Request) {
  return { requestId: String(req.id), ipAddress: req.ip };
}
function sendSession(res: Response, message: string, session: Session, status = 200) {
  setRefreshCookie(res, session.refreshToken, session.expiresAt);
  success(res, message, { accessToken: session.accessToken, user: session.user }, status);
}

export const register: RequestHandler = async (req, res) =>
  sendSession(res, "Account created.", await auth.register(req.body, requestDetails(req)), 201);
export const login: RequestHandler = async (req, res) =>
  sendSession(res, "Login successful.", await auth.login(req.body, requestDetails(req)));
export const refresh: RequestHandler = async (req, res) => {
  try {
    sendSession(
      res,
      "Session refreshed.",
      await auth.refresh(refreshCookie(req), requestDetails(req)),
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
};
export const logout: RequestHandler = async (req, res) => {
  await auth.logout(refreshCookie(req), requestDetails(req));
  clearRefreshCookie(res);
  success(res, "Logged out.");
};
export const logoutAll: RequestHandler = async (req, res) => {
  await auth.logoutAll(req.auth!.id, requestDetails(req));
  clearRefreshCookie(res);
  success(res, "Logged out on all devices.");
};
export const me: RequestHandler = (req, res) => {
  success(res, "Authenticated user.", req.auth);
};
export const changePassword: RequestHandler = async (req, res) => {
  await auth.changePassword(req.auth!.id, req.body, requestDetails(req));
  clearRefreshCookie(res);
  success(res, "Password changed. Sign in again.");
};
export const addRole: RequestHandler = async (req, res) => {
  success(res, "Role added.", await auth.addRole(req.auth!.id, req.body, requestDetails(req)), 201);
};
