import type { ApiResponse } from "@/types/auth";
import type {
  BankAccount,
  BankPayload,
  Checklist,
  Provider,
  ProviderDocumentRow,
  ProviderProfilePayload,
} from "@/types/provider";
import { api } from "./axios";

const data = <T>(response: { data: ApiResponse<T> }) => response.data.data;

export const providersApi = {
  me: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Provider>>("/providers/me", { signal })),
  create: async (payload: ProviderProfilePayload) =>
    data(await api.post<ApiResponse<Provider>>("/providers/me", payload)),
  update: async (payload: Partial<ProviderProfilePayload>) =>
    data(await api.patch<ApiResponse<Provider>>("/providers/me", payload)),
  documents: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<ProviderDocumentRow[]>>("/providers/me/documents", { signal })),
  putDocument: async (payload: {
    documentTypeCode: string;
    equipmentId?: string;
    fileId: string;
  }) => data(await api.put<ApiResponse<unknown>>("/providers/me/documents", payload)),
  saveBank: async (payload: BankPayload) =>
    data(await api.put<ApiResponse<BankAccount>>("/providers/me/bank-account", payload)),
  checklist: async (signal?: AbortSignal) =>
    data(await api.get<ApiResponse<Checklist>>("/providers/me/checklist", { signal })),
  ifsc: async (ifsc: string) => {
    try {
      return data(
        await api.get<ApiResponse<{ ifsc: string; bank: string; branch: string }>>(
          "/masters/ifsc/" + ifsc,
        ),
      );
    } catch {
      return null; // unknown IFSC or directory not loaded: the format check is enough
    }
  },
};
