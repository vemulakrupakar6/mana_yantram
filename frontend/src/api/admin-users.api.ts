import type { AdminUser, Page } from "@/types/admin";
import type { ApiResponse, JurisdictionLevel } from "@/types/auth";
import { api } from "./axios";
import { endpoints } from "./endpoints";

export interface UserListQuery {
  search?: string;
  role?: string;
  status?: string;
  page: number;
  pageSize?: number;
}
export interface CreateUserPayload {
  username: string;
  displayName: string;
  mobile?: string;
  role: string;
  jurisdiction: { level: JurisdictionLevel; districtId?: string; mandalId?: string };
  temporaryPassword: string;
}
const one = (id: string) => endpoints.adminUsers + "/" + id;
export const adminUsersApi = {
  list: async (query: UserListQuery, signal?: AbortSignal) =>
    (
      await api.get<ApiResponse<Page<AdminUser>>>(endpoints.adminUsers, {
        signal,
        params: Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "")),
      })
    ).data.data,
  get: async (id: string, signal?: AbortSignal) =>
    (await api.get<ApiResponse<AdminUser>>(one(id), { signal })).data.data,
  create: async (payload: CreateUserPayload) =>
    (await api.post<ApiResponse<AdminUser>>(endpoints.adminUsers, payload)).data.data,
  deactivate: async (id: string, reason: string) =>
    (await api.post<ApiResponse<AdminUser>>(one(id) + "/deactivate", { reason })).data.data,
  reactivate: async (id: string) =>
    (await api.post<ApiResponse<AdminUser>>(one(id) + "/reactivate")).data.data,
  resetPassword: async (id: string, temporaryPassword: string) =>
    (await api.post<ApiResponse<AdminUser>>(one(id) + "/reset-password", { temporaryPassword }))
      .data.data,
};
