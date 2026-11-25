import { Navigate, Outlet, useLocation } from "react-router-dom";
import { dashboardPreview } from "@/config/app";
import { FullPageLoader } from "@/components/common/shared";
import { useAuth } from "@/stores/auth";
import type { AuthUser, Portal, RoleCode } from "@/types/auth";

export function portalFor(role: RoleCode | null): Portal | null {
  if (!role) return null;
  if (role === "FARMER") return "farmer";
  if (role === "PROVIDER") return "provider";
  if (role === "OPERATOR") return "operator";
  return "admin";
}
export function onboardingPending(user: AuthUser, role: RoleCode) {
  return (role === "FARMER" || role === "PROVIDER") && user.onboarding[role] !== "COMPLETED";
}
const allowedExact = new Set(["/onboarding", "/profile", "/account/password"]);
const allowedPrefixes = ["/farmer/", "/provider/", "/operator/", "/admin/"];
export function safeReturn(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return null;
  const path = value.split(/[?#]/)[0];
  return allowedExact.has(path) || allowedPrefixes.some((prefix) => path.startsWith(prefix))
    ? value
    : null;
}
export function userDestination(user: AuthUser, role: RoleCode | null, intended?: string | null) {
  if (user.mustChangePassword) return "/account/password";
  if (!role && user.roles.length > 1) return "/select-role";
  const portal = portalFor(role);
  if (intended && ["/profile", "/account/password"].includes(intended.split(/[?#]/)[0]))
    return intended;
  if (!portal || !role) return "/403";
  if (onboardingPending(user, role)) {
    return dashboardPreview && intended?.split(/[?#]/)[0] === "/" + portal + "/dashboard"
      ? intended
      : "/onboarding";
  }
  if (intended && intended.split(/[?#]/)[0] !== "/onboarding") return intended;
  return "/" + portal + "/dashboard";
}
export function ProtectedRoute() {
  const user = useAuth((state) => state.user);
  const isInitializing = useAuth((state) => state.isInitializing);
  const signOutLocationKey = useAuth((state) => state.signOutLocationKey);
  const location = useLocation();
  if (isInitializing) return <FullPageLoader />;
  if (user?.mustChangePassword && location.pathname !== "/account/password")
    return <Navigate to="/account/password" replace state={{ mustChange: true }} />;
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={{
          next:
            location.key === signOutLocationKey
              ? null
              : safeReturn(location.pathname + location.search + location.hash),
        }}
      />
    );
  return <Outlet />;
}
export function GuestRoute() {
  const user = useAuth((state) => state.user);
  const role = useAuth((state) => state.activeRole);
  const isInitializing = useAuth((state) => state.isInitializing);
  const location = useLocation();
  if (isInitializing) return <FullPageLoader />;
  if (!user) return <Outlet />;
  const intended = safeReturn(location.state?.next);
  return <Navigate to={userDestination(user, role, intended)} replace state={{ next: intended }} />;
}
export function RoleGuard({ portal }: { portal: Portal }) {
  const user = useAuth((state) => state.user)!;
  const role = useAuth((state) => state.activeRole);
  const location = useLocation();
  if (!user.roles.some((assigned) => portalFor(assigned) === portal))
    return <Navigate to="/403" replace />;
  if (!role)
    return (
      <Navigate
        to="/select-role"
        replace
        state={{ next: safeReturn(location.pathname + location.search + location.hash) }}
      />
    );
  if (portalFor(role) !== portal) return <Navigate to="/403" replace />;
  if (onboardingPending(user, role) && !dashboardPreview)
    return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
export function PermissionGuard({ permission }: { permission: string }) {
  const user = useAuth((state) => state.user)!;
  if (!user.permissions.includes(permission)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
