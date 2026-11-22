import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import {
  AccountLayout,
  AdminLayout,
  FarmerLayout,
  ProviderLayout,
} from "@/layouts/DashboardLayout";
import { InfoPage, LandingPage, ServicesPage } from "@/pages/public/PublicPages";
import { RouteErrorPage } from "@/pages/errors/ErrorPages";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AccountRegistrationPage, RoleRegistrationPage } from "@/pages/auth/RegisterPages";
import { OnboardingPage, SelectRolePage } from "@/pages/auth/SessionPages";
import { AccountPage, ChangePasswordPage } from "@/pages/profile/AccountPages";
import { FarmerDashboard } from "@/pages/farmer/FarmerDashboard";
import { ProviderDashboard } from "@/pages/provider/ProviderDashboard";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { restoreSession } from "@/features/auth/session";
import { GuestRoute, ProtectedRoute, RoleGuard, portalFor } from "@/routes/access";
import { useAuth } from "@/stores/auth";

export default function App() {
  const activeRole = useAuth((state) => state.activeRole);
  const portal = portalFor(activeRole);
  const dashboard = portal ? "/" + portal + "/dashboard" : undefined;
  useEffect(() => {
    void restoreSession();
  }, []);
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="about" element={<InfoPage kind="about" />} />
        <Route path="help" element={<InfoPage kind="help" />} />
        <Route path="terms" element={<InfoPage kind="terms" />} />
        <Route path="privacy" element={<InfoPage kind="privacy" />} />
        <Route path="403" element={<RouteErrorPage code={403} dashboard={dashboard} />} />
        <Route path="404" element={<RouteErrorPage code={404} dashboard={dashboard} />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RoleRegistrationPage />} />
          <Route path="register/account" element={<AccountRegistrationPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AccountLayout />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="select-role" element={<SelectRolePage />} />
          <Route path="profile" element={<AccountPage />} />
          <Route path="account/password" element={<ChangePasswordPage />} />
        </Route>
        <Route path="farmer" element={<RoleGuard portal="farmer" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<FarmerLayout />}>
            <Route path="dashboard" element={<FarmerDashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
        <Route path="provider" element={<RoleGuard portal="provider" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<ProviderLayout />}>
            <Route path="dashboard" element={<ProviderDashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
        <Route path="admin" element={<RoleGuard portal="admin" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
