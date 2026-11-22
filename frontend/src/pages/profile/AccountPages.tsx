import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authApi } from "@/api/auth.api";
import {
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { LanguageField, TextField } from "@/components/forms/AuthFields";
import { LogoutButton } from "@/components/navigation/LogoutButton";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setLanguage } from "@/config/i18n";
import { errorKey } from "@/features/auth/errors";
import { logout } from "@/features/auth/session";
import { userDestination } from "@/routes/access";
import {
  passwordSchema,
  profileSchema,
  type PasswordInput,
  type ProfileInput,
} from "@/schemas/auth";
import { useAuth } from "@/stores/auth";
import { roleLabels, type AccountProfile } from "@/types/auth";

export function AccountPage() {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user)!;
  const role = useAuth((state) => state.activeRole);
  const query = useQuery({
    queryKey: ["profile", user.id],
    queryFn: ({ signal }) => authApi.profile(signal),
  });
  if (query.isPending) return <FullPageLoader />;
  if (!query.data) return <ErrorState title={t("error")} retry={() => void query.refetch()} />;
  return (
    <section className="panel account-panel">
      <PageHeader title={t("profile")}>
        <Button variant="outline" asChild>
          <Link to={userDestination(user, role)}>{t("back")}</Link>
        </Button>
      </PageHeader>
      <AccountForm key={query.data.id} profile={query.data} />
    </section>
  );
}
function AccountForm({ profile }: { profile: AccountProfile }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { key } = useLocation();
  const values = (data: AccountProfile) => ({
    displayName: data.displayName || "",
    mobile: data.mobile || "",
    email: data.email || "",
    preferredLanguage: data.preferredLanguage,
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: values(profile),
  });
  const submit = handleSubmit(async (input) => {
    try {
      const updated = await authApi.updateProfile(input);
      queryClient.setQueryData(["profile", profile.id], updated);
      const user = useAuth.getState().user;
      if (user?.id === updated.id)
        useAuth.getState().setUser({
          ...user,
          displayName: updated.displayName,
          preferredLanguage: updated.preferredLanguage,
          roles: updated.roles,
        });
      await setLanguage(updated.preferredLanguage);
      reset(values(updated));
      toast.success(t("saved"));
    } catch (error) {
      setError("root", { message: errorKey(error) });
    }
  });
  async function logoutEverywhere() {
    try {
      await logout(key, true);
    } catch (error) {
      toast.error(t(errorKey(error)));
    }
  }
  return (
    <>
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField
          label="username"
          input={{ id: "profile-username", readOnly: true, value: profile.username }}
        />
        <dl className="account-facts">
          <div>
            <dt>{t("roles")}</dt>
            <dd>
              {profile.roles.map((role) => (
                <StatusBadge key={role}>{t(roleLabels[role])}</StatusBadge>
              ))}
            </dd>
          </div>
          <div>
            <dt>{t("createdAt")}</dt>
            <dd>
              <time dateTime={profile.createdAt}>
                {new Intl.DateTimeFormat(i18n.language === "te" ? "te-IN" : "en-IN", {
                  dateStyle: "medium",
                }).format(new Date(profile.createdAt))}
              </time>
            </dd>
          </div>
        </dl>
        <TextField
          label="displayName"
          input={{ id: "profile-name", autoComplete: "name", ...register("displayName") }}
          error={errors.displayName?.message}
        />
        <TextField
          label="mobile"
          hint={profile.mobileVerified ? undefined : "unverifiedHint"}
          input={{ id: "profile-mobile", type: "tel", autoComplete: "tel", ...register("mobile") }}
          error={errors.mobile?.message}
        />
        <TextField
          label="email"
          hint={profile.emailVerified ? undefined : "unverifiedHint"}
          input={{
            id: "profile-email",
            type: "email",
            autoComplete: "email",
            ...register("email"),
          }}
          error={errors.email?.message}
        />
        <LanguageField id="profile-language" {...register("preferredLanguage")} />
        {errors.root?.message && (
          <p role="alert" className="form-alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("save")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/account/password">{t("changePassword")}</Link>
          </Button>
        </div>
      </form>
      <div className="form-actions account-session-actions">
        <LogoutButton />
        <ConfirmDialog
          trigger={<Button variant="outline">{t("logoutAll")}</Button>}
          title={t("confirmLogout")}
          description={t("logoutAllBody")}
          action={t("logoutAll")}
          onConfirm={() => void logoutEverywhere()}
        />
      </div>
    </>
  );
}
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { key: locationKey } = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const submit = handleSubmit(async (input) => {
    try {
      await authApi.changePassword(input);
      useAuth.getState().clear(locationKey);
      toast.success(t("passwordChanged"));
    } catch (error) {
      const key = errorKey(error);
      if (key === "invalidCurrent")
        setError("currentPassword", { message: key }, { shouldFocus: true });
      else setError("root", { message: key });
    }
  });
  return (
    <section className="panel account-panel">
      <PageHeader title={t("changePassword")} />
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField
          label="currentPassword"
          kind="password"
          input={{
            id: "current-password",
            autoComplete: "current-password",
            ...register("currentPassword"),
          }}
          error={errors.currentPassword?.message}
        />
        <TextField
          label="newPassword"
          kind="password"
          hint="passwordHint"
          input={{ id: "new-password", autoComplete: "new-password", ...register("newPassword") }}
          error={errors.newPassword?.message}
        />
        <TextField
          label="confirmNewPassword"
          kind="password"
          input={{
            id: "confirm-new-password",
            autoComplete: "new-password",
            ...register("confirmPassword"),
          }}
          error={errors.confirmPassword?.message}
        />
        {errors.root?.message && (
          <p role="alert" className="form-alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("save")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/profile">{t("cancel")}</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
