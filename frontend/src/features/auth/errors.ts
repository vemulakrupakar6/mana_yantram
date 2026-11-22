import axios from "axios";
import type { ApiError } from "@/types/auth";

const labels: Record<string, string> = {
  INVALID_CREDENTIALS: "invalidCredentials",
  USERNAME_TAKEN: "usernameTaken",
  RATE_LIMITED: "rateLimited",
  INVALID_SESSION: "sessionExpired",
  INCORRECT_CURRENT_PASSWORD: "invalidCurrent",
  VALIDATION_ERROR: "validation",
  ACCESS_DENIED: "denied",
};
export function errorKey(error: unknown) {
  return axios.isAxiosError<ApiError>(error)
    ? (labels[error.response?.data?.code ?? ""] ?? "error")
    : "error";
}
