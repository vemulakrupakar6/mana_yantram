import axios, { type InternalAxiosRequestConfig } from "axios";
import { apiBase } from "@/config/app";
import { useAuth } from "@/stores/auth";
import type { ApiError, ApiResponse, AuthSession } from "@/types/auth";
import { endpoints } from "./endpoints";

const options = { baseURL: apiBase, withCredentials: true, timeout: 12_000 };
const writeHeaders = { "X-CSRF-Protection": "1" };
export const cookieClient = axios.create({ ...options, headers: writeHeaders });
export const api = axios.create({ ...options, headers: writeHeaders });

let queue = Promise.resolve();
export function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> =>
    navigator.locks
      ? await navigator.locks.request("mana-yantram-session", operation)
      : operation();
  const result = queue.then(run);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

let refreshPromise: Promise<AuthSession> | undefined;
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = withSessionLock(async () => {
      try {
        const response = await cookieClient.post<ApiResponse<AuthSession>>(endpoints.refresh);
        useAuth.getState().setSession(response.data.data);
        return response.data.data;
      } catch (error) {
        useAuth.getState().clear();
        throw error;
      }
    }).finally(() => {
      refreshPromise = undefined;
    });
  }
  return refreshPromise;
}

type RetryConfig = InternalAxiosRequestConfig & { retried?: boolean; authUserId?: string };
api.interceptors.request.use((config: RetryConfig) => {
  const { accessToken, user } = useAuth.getState();
  config.authUserId = user?.id;
  if (accessToken) config.headers.set("Authorization", "Bearer " + accessToken);
  return config;
});
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError<ApiError>(error) || error.response?.status !== 401 || !error.config)
    throw error;
  const config: RetryConfig = error.config;
  const code = error.response.data?.code;
  const { accessToken: current, user } = useAuth.getState();
  if (config.authUserId !== user?.id) throw error;
  if (config.retried || code !== "TOKEN_EXPIRED" || !current) {
    if (
      current &&
      config.headers.get("Authorization") === "Bearer " + current &&
      (code === "INVALID_SESSION" || code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED")
    ) {
      useAuth.getState().clear();
    }
    throw error;
  }
  config.retried = true;
  if (config.headers.get("Authorization") === "Bearer " + current) await refreshSession();
  if (!useAuth.getState().accessToken || config.authUserId !== useAuth.getState().user?.id)
    throw error;
  return api.request(config);
});
