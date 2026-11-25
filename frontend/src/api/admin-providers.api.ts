import type { Page } from "@/types/admin";
import type { ApiResponse } from "@/types/auth";
import type { Provider } from "@/types/provider";
import type {
  AdminProviderDetail,
  AdminProviderRow,
  HistoryItem,
  VerifyPayload,
} from "@/types/verification";
import { api } from "./axios";

const data = <T>(response: { data: ApiResponse<T> }) => response.data.data;
const base = "/admin/providers";
const params = (query: object) =>
  Object.fromEntries(Object.entries(query).filter(([, v]) => v !== "" && v != null));

export const adminProvidersApi = {
  list: async (
    query: { status?: string; districtId?: string; type?: string; search?: string; page: number },
    signal?: AbortSignal,
  ) =>
    data(
      await api.get<ApiResponse<Page<AdminProviderRow>>>(base, { params: params(query), signal }),
    ),
  get: async (id: string, signal?: AbortSignal) =>
    data(await api.get<ApiResponse<AdminProviderDetail>>(`${base}/${id}`, { signal })),
  reviewDocument: async (
    id: string,
    docId: string,
    decision: "ACCEPT" | "RETURN",
    remarks?: string,
  ) =>
    data(
      await api.post<ApiResponse<unknown>>(`${base}/${id}/documents/${docId}/review`, {
        decision,
        remarks,
      }),
    ),
  reviewBank: async (id: string, decision: "ACCEPT" | "RETURN", remarks?: string) =>
    data(
      await api.post<ApiResponse<unknown>>(`${base}/${id}/bank-account/review`, {
        decision,
        remarks,
      }),
    ),
  revealBank: async (id: string) =>
    data(
      await api.get<ApiResponse<{ holderName: string; accountNumber: string; ifsc: string }>>(
        `${base}/${id}/bank-account/reveal`,
      ),
    ),
  verify: async (id: string, payload: VerifyPayload) =>
    data(await api.post<ApiResponse<AdminProviderDetail>>(`${base}/${id}/verify`, payload)),
  suspend: async (id: string, remarks: string) =>
    data(await api.post<ApiResponse<AdminProviderDetail>>(`${base}/${id}/suspend`, { remarks })),
  blacklist: async (id: string, remarks: string) =>
    data(await api.post<ApiResponse<AdminProviderDetail>>(`${base}/${id}/blacklist`, { remarks })),
  reinstate: async (id: string, remarks?: string) =>
    data(
      await api.post<ApiResponse<AdminProviderDetail>>(
        `${base}/${id}/reinstate`,
        remarks ? { remarks } : {},
      ),
    ),
};
export const submissionApi = {
  submit: async () => data(await api.post<ApiResponse<Provider>>("/providers/me/submit")),
  history: async (signal?: AbortSignal) =>
    data(
      await api.get<ApiResponse<HistoryItem[]>>("/providers/me/verification-history", { signal }),
    ),
};
