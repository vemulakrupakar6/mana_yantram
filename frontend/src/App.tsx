import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import {
  AccountLayout,
  AdminLayout,
  FarmerLayout,
  OperatorLayout,
  ProviderLayout,
} from "@/layouts/DashboardLayout";
import { InfoPage, LandingPage, ServicesPage } from "@/pages/public/PublicPages";
import { RouteErrorPage } from "@/pages/errors/ErrorPages";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AccountRegistrationPage, RoleRegistrationPage } from "@/pages/auth/RegisterPages";
import { OnboardingPage, SelectRolePage } from "@/pages/auth/SessionPages";
import { AccountPage, ChangePasswordPage } from "@/pages/profile/AccountPages";
import { FarmerDashboard } from "@/pages/farmer/FarmerDashboard";
import {
  EquipmentDetailPage,
  EquipmentListPage,
  EquipmentNewPage,
} from "@/pages/provider/EquipmentPages";
import { AvailabilityPage } from "@/pages/provider/AvailabilityPage";
import { CoveragePage } from "@/pages/provider/CoveragePage";
import {
  OperatorDetailPage,
  OperatorListPage,
  OperatorNewPage,
} from "@/pages/provider/OperatorPages";
import { ProviderDashboard } from "@/pages/provider/ProviderDashboard";
import {
  ProviderBankPage,
  ProviderDocumentsPage,
  ProviderProfilePage,
} from "@/pages/provider/ProviderPages";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { OperatorDashboard } from "@/pages/operator/OperatorDashboard";
import {
  AdminFarmerDetailPage,
  AdminFarmersPage,
  AssistedDetailPage,
  AssistedListPage,
  AssistedNewPage,
  AssistedPlotNewPage,
} from "@/pages/admin/farmers/FarmerAdminPages";
import { FarmerProfilePage, PlotEditPage, PlotsListPage } from "@/pages/farmer/FarmerPages";
import {
  AdminProviderReviewPage,
  AdminProvidersPage,
} from "@/pages/admin/providers/ProviderAdminPages";
import { RateCapsPage } from "@/pages/admin/settings/RateCapsPage";
import { UserCreatePage, UserDetailPage, UserListPage } from "@/pages/admin/users/UserPages";
import { restoreSession } from "@/features/auth/session";
import { GuestRoute, PermissionGuard, ProtectedRoute, RoleGuard, portalFor } from "@/routes/access";
import { permissions } from "@/constants/roles";
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
            <Route path="profile" element={<FarmerProfilePage />} />
            <Route path="plots" element={<PlotsListPage />} />
            <Route path="plots/new" element={<PlotEditPage />} />
            <Route path="plots/:plotId" element={<PlotEditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
        <Route path="provider" element={<RoleGuard portal="provider" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<ProviderLayout />}>
            <Route path="dashboard" element={<ProviderDashboard />} />
            <Route path="profile" element={<ProviderProfilePage />} />
            <Route path="documents" element={<ProviderDocumentsPage />} />
            <Route path="bank" element={<ProviderBankPage />} />
            <Route path="coverage" element={<CoveragePage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="operators" element={<OperatorListPage />} />
            <Route path="operators/new" element={<OperatorNewPage />} />
            <Route path="operators/:operatorId" element={<OperatorDetailPage />} />
            <Route path="equipment" element={<EquipmentListPage />} />
            <Route path="equipment/new" element={<EquipmentNewPage />} />
            <Route path="equipment/:equipmentId" element={<EquipmentDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
        <Route path="operator" element={<RoleGuard portal="operator" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<OperatorLayout />}>
            <Route path="dashboard" element={<OperatorDashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
        <Route path="admin" element={<RoleGuard portal="admin" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route element={<PermissionGuard permission={permissions.providerView} />}>
              <Route path="providers" element={<AdminProvidersPage />} />
              <Route path="providers/:providerId" element={<AdminProviderReviewPage />} />
            </Route>
            <Route element={<PermissionGuard permission={permissions.farmerView} />}>
              <Route path="farmers" element={<AdminFarmersPage />} />
              <Route path="farmers/:farmerId" element={<AdminFarmerDetailPage />} />
            </Route>
            <Route element={<PermissionGuard permission={permissions.farmerRegisterAssisted} />}>
              <Route path="assisted-registration" element={<AssistedListPage />} />
              <Route path="assisted-registration/new" element={<AssistedNewPage />} />
              <Route path="assisted-registration/:farmerId" element={<AssistedDetailPage />} />
              <Route
                path="assisted-registration/:farmerId/plots/new"
                element={<AssistedPlotNewPage />}
              />
            </Route>
            <Route element={<PermissionGuard permission={permissions.usersManage} />}>
              <Route path="users" element={<UserListPage />} />
              <Route path="users/new" element={<UserCreatePage />} />
              <Route path="users/:userId" element={<UserDetailPage />} />
            </Route>
            <Route element={<PermissionGuard permission={permissions.settingsManage} />}>
              <Route path="settings" element={<RateCapsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
