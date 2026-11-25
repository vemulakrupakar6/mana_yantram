import type {
  AccountProfile,
  ApiResponse,
  AuthSession,
  AuthUser,
  Portal,
  PublicRole,
  RoleCode,
} from "@/types/auth";
import type { AccountInput, LoginInput, PasswordInput, ProfileInput } from "@/schemas/auth";
import { api, cookieClient } from "./axios";
import { endpoints } from "./endpoints";

export const authApi = {
  login: async (input: LoginInput) =>
    (await cookieClient.post<ApiResponse<AuthSession>>(endpoints.login, input)).data.data,
  register: async (input: AccountInput) =>
    (await cookieClient.post<ApiResponse<AuthSession>>(endpoints.register, input)).data.data,
  logout: async () => {
    await cookieClient.post(endpoints.logout);
  },
  logoutAll: async () => {
    await api.post(endpoints.logoutAll);
  },
  me: async () => (await api.get<ApiResponse<AuthUser>>(endpoints.me)).data.data,
  changePassword: async (input: PasswordInput) => {
    await api.patch(endpoints.password, input);
  },
  profile: async (signal?: AbortSignal) =>
    (await api.get<ApiResponse<AccountProfile>>(endpoints.profile, { signal })).data.data,
  updateProfile: async (input: ProfileInput) =>
    (
      await api.patch<ApiResponse<AccountProfile>>(endpoints.profile, {
        ...input,
        displayName: input.displayName || null,
        mobile: input.mobile || null,
        email: input.email || null,
      })
    ).data.data,
  addRole: async (role: PublicRole) =>
    (await api.post<ApiResponse<AuthUser>>(endpoints.roles, { role })).data.data,
  checkPortal: async (portal: Portal, signal?: AbortSignal) =>
    (await api.get<ApiResponse<{ roles: RoleCode[] }>>(endpoints.portal(portal), { signal })).data
      .data,
};
