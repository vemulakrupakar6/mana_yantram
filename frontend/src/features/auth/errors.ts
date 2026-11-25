import axios from "axios";
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import type { ApiError } from "@/types/auth";

const labels: Record<string, string> = {
  INVALID_CREDENTIALS: "invalidCredentials",
  USERNAME_TAKEN: "usernameTaken",
  RATE_LIMITED: "rateLimited",
  INVALID_SESSION: "sessionExpired",
  INCORRECT_CURRENT_PASSWORD: "invalidCurrent",
  VALIDATION_ERROR: "validation",
  ACCESS_DENIED: "denied",
  ACCOUNT_DEACTIVATED: "accountDeactivated",
  PASSWORD_CHANGE_REQUIRED: "passwordChangeRequired",
  MOBILE_TAKEN: "mobileTaken",
  ROLE_EXISTS: "roleExists",
  ROLE_NOT_GRANTABLE: "roleNotGrantable",
  OUT_OF_JURISDICTION: "outOfJurisdiction",
  INVALID_STATE: "invalidState",
  NOT_FOUND: "notFound",
  AADHAAR_TAKEN: "aadhaarTaken",
  PROFILE_EXISTS: "profileExists",
  PROFILE_REQUIRED: "profileRequired",
  PLOT_LIMIT: "plotLimit",
  SERVICE_EXISTS: "serviceExists",
  UNIT_LIMIT: "unitLimit",
  BLOCK_OVERLAP: "blockOverlap",
  APPLICATION_INCOMPLETE: "applicationIncomplete",
  RATE_ABOVE_CAP: "rateAboveCap",
  CAP_EXISTS: "capExists",
};
export function errorKey(error: unknown) {
  return axios.isAxiosError<ApiError>(error)
    ? (labels[error.response?.data?.code ?? ""] ?? "error")
    : "error";
}
/**
 * Maps the API's per-field errors (422 / 409) onto react-hook-form. Returns true when at least
 * one field error was applied; otherwise the caller should show a form-level message.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  known?: readonly string[],
) {
  if (!axios.isAxiosError<ApiError>(error)) return false;
  let applied = false;
  for (const item of error.response?.data?.errors ?? []) {
    if (known && !known.includes(item.field)) continue;
    // The cap message carries the allowed amount, so it is shown as sent by the server.
    const code = error.response?.data?.code ?? "";
    setError(item.field as FieldPath<T>, {
      message: code === "RATE_ABOVE_CAP" ? item.message : (labels[code] ?? "validation"),
    });
    applied = true;
  }
  return applied;
}
