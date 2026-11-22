import { create } from "zustand";
import type { AuthSession, AuthUser, RoleCode } from "@/types/auth";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  activeRole: RoleCode | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  signOutLocationKey: string | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: AuthUser) => void;
  updateAccessToken: (accessToken: string) => void;
  selectRole: (role: RoleCode) => boolean;
  finishInitialization: () => void;
  clear: (signOutLocationKey?: string) => void;
}
function activeRole(user: AuthUser, current: RoleCode | null) {
  if (current && user.roles.includes(current)) return current;
  return user.roles.length === 1 ? user.roles[0] : null;
}
export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  activeRole: null,
  isAuthenticated: false,
  isInitializing: true,
  signOutLocationKey: null,
  setSession: ({ user, accessToken }) =>
    set((state) => ({
      user,
      accessToken,
      isAuthenticated: true,
      signOutLocationKey: null,
      activeRole: activeRole(user, state.user?.id === user.id ? state.activeRole : null),
    })),
  setUser: (user) => set((state) => ({ user, activeRole: activeRole(user, state.activeRole) })),
  updateAccessToken: (accessToken) => set({ accessToken }),
  selectRole: (role) => {
    if (!get().user?.roles.includes(role)) return false;
    set({ activeRole: role });
    return true;
  },
  finishInitialization: () => set({ isInitializing: false }),
  clear: (signOutLocationKey) =>
    set({
      user: null,
      accessToken: null,
      activeRole: null,
      isAuthenticated: false,
      isInitializing: false,
      signOutLocationKey: signOutLocationKey ?? null,
    }),
}));
