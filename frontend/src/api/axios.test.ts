import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, expect, test, vi } from "vitest";
import { useAuth } from "@/stores/auth";
import type { AuthSession } from "@/types/auth";
import { api, cookieClient } from "./axios";

const session: AuthSession = {
  accessToken: "expiring-access-token",
  user: {
    id: "test-user",
    username: "farmer",
    displayName: null,
    roles: ["FARMER"],
    preferredLanguage: "en",
    permissions: ["portal:farmer"],
    onboarding: { FARMER: "NOT_STARTED" },
    mustChangePassword: false,
    jurisdiction: null,
  },
};
const defaultApi = api.defaults.adapter;
const defaultCookie = cookieClient.defaults.adapter;
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} };
}
function unauthorized(config: InternalAxiosRequestConfig, code: string) {
  return new AxiosError(
    code,
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    response(config, { code }, 401),
  );
}
afterEach(() => {
  api.defaults.adapter = defaultApi;
  cookieClient.defaults.adapter = defaultCookie;
  useAuth.getState().clear();
});
test("uses a single refresh for concurrent expired-token responses and retries each request once", async () => {
  useAuth.getState().setSession(session);
  const renew = vi.fn(async (config: InternalAxiosRequestConfig) =>
    response(config, { data: { ...session, accessToken: "renewed" } }),
  );
  const protectedRequest = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (config.headers.get("Authorization") !== "Bearer renewed")
      throw unauthorized(config, "TOKEN_EXPIRED");
    return response(config, { data: "ok" });
  });
  api.defaults.adapter = protectedRequest;
  cookieClient.defaults.adapter = renew;
  const values = await Promise.all([api.get("/users/profile"), api.get("/auth/me")]);
  expect(values.map((value) => value.data.data)).toEqual(["ok", "ok"]);
  expect(renew).toHaveBeenCalledTimes(1);
  expect(protectedRequest).toHaveBeenCalledTimes(4);
  expect(useAuth.getState().accessToken).toBe("renewed");
});
test("clears authentication when the refresh request fails", async () => {
  useAuth.getState().setSession(session);
  api.defaults.adapter = async (config) => {
    throw unauthorized(config, "TOKEN_EXPIRED");
  };
  cookieClient.defaults.adapter = async (config) => {
    throw unauthorized(config, "INVALID_SESSION");
  };
  await expect(api.get("/users/profile")).rejects.toThrow("INVALID_SESSION");
  expect(useAuth.getState()).toMatchObject({
    accessToken: null,
    user: null,
    isAuthenticated: false,
  });
});

test("never retries an old account's request with another account's access token", async () => {
  useAuth.getState().setSession(session);
  const protectedRequest = vi.fn(async (config: InternalAxiosRequestConfig) => {
    throw unauthorized(config, "TOKEN_EXPIRED");
  });
  api.defaults.adapter = protectedRequest;
  cookieClient.defaults.adapter = async (config) =>
    response(config, {
      data: {
        ...session,
        accessToken: "different-account",
        user: { ...session.user, id: "another-user" },
      },
    });
  await expect(api.patch("/users/profile", { displayName: "Test profile" })).rejects.toThrow(
    "TOKEN_EXPIRED",
  );
  expect(protectedRequest).toHaveBeenCalledTimes(1);
});
