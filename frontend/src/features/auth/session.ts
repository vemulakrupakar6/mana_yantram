import { authApi } from "@/api/auth.api";
import { refreshSession, withSessionLock } from "@/api/axios";
import { useAuth } from "@/stores/auth";
import { setLanguage } from "@/config/i18n";
import type { AccountInput, LoginInput } from "@/schemas/auth";

let initialization: Promise<void> | undefined;
export function restoreSession() {
  return (initialization ??= (async () => {
    try {
      const session = await refreshSession();
      const user = await authApi.me();
      if (useAuth.getState().user?.id === session.user.id) useAuth.getState().setUser(user);
    } catch {
      useAuth.getState().clear();
    } finally {
      useAuth.getState().finishInitialization();
    }
  })());
}
export function login(input: LoginInput) {
  return withSessionLock(async () => {
    const session = await authApi.login(input);
    useAuth.getState().setSession(session);
    await setLanguage(session.user.preferredLanguage);
    return session.user;
  });
}
export function register(input: AccountInput) {
  return withSessionLock(async () => {
    const session = await authApi.register(input);
    useAuth.getState().setSession(session);
    await setLanguage(session.user.preferredLanguage);
    return session.user;
  });
}
export function logout(locationKey: string, allDevices = false) {
  if (allDevices) return authApi.logoutAll().then(() => useAuth.getState().clear(locationKey));
  return withSessionLock(async () => {
    await authApi.logout();
    useAuth.getState().clear(locationKey);
  });
}
