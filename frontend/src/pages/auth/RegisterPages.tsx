import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sprout, Tractor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadingSpinner, PageHeader, StatusBadge } from "@/components/common/shared";
import { LanguageField, TextField } from "@/components/forms/AuthFields";
import { Button } from "@/components/ui/button";
import { register as createAccount } from "@/features/auth/session";
import { errorKey } from "@/features/auth/errors";
import { accountSchema, type AccountInput } from "@/schemas/auth";
import { roleLabels, type PublicRole } from "@/types/auth";

function parseRole(role: string | null): PublicRole | null {
  return role === "FARMER" || role === "PROVIDER" ? role : null;
}
function Progress({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <div className="registration-progress">
      <span>{t("step", { step })}</span>
      <progress value={step} max={2} aria-label={t("step", { step })} />
    </div>
  );
}
export function RoleRegistrationPage() {
  const { t } = useTranslation();
  const [query] = useSearchParams();
  const [role, setRole] = useState<PublicRole | null>(() => parseRole(query.get("role")));
  const navigate = useNavigate();
  return (
    <>
      <Progress step={1} />
      <PageHeader title={t("chooseAccount")} description={t("chooseAccountBody")} />
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (role) navigate("/register/account?role=" + role);
        }}
      >
        <fieldset className="role-options" aria-label={t("chooseAccount")}>
          {(
            [
              ["FARMER", Sprout, "farmerDesc"],
              ["PROVIDER", Tractor, "providerDesc"],
            ] as const
          ).map(([value, Icon, detail]) => (
            <label key={value} className="role-card">
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
              />
              <span className="icon-tile">
                <Icon size={24} />
              </span>
              <strong>{t(roleLabels[value])}</strong>
              <small>{t(detail)}</small>
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={!role}>
          {t("continue")}
        </Button>
      </form>
      <p className="auth-alternate">
        {t("already")}{" "}
        <Link className="text-link" to="/login">
          {t("login")}
        </Link>
      </p>
    </>
  );
}
export function AccountRegistrationPage() {
  const [query] = useSearchParams();
  const role = parseRole(query.get("role"));
  return role ? <RegistrationForm role={role} key={role} /> : <Navigate to="/register" replace />;
}
function RegistrationForm({ role }: { role: PublicRole }) {
  const { t, i18n } = useTranslation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      role,
      username: "",
      password: "",
      confirmPassword: "",
      preferredLanguage: i18n.language === "te" ? "te" : "en",
      acceptTerms: false,
      acceptPrivacyPolicy: false,
    },
  });
  const submit = handleSubmit(async (input) => {
    try {
      await createAccount(input);
    } catch (error) {
      const key = errorKey(error);
      if (key === "usernameTaken") setError("username", { message: key }, { shouldFocus: true });
      else setError("root", { message: key });
    }
  });
  return (
    <>
      <Progress step={2} />
      <PageHeader title={t("createHeading")} />
      <div className="registration-role">
        <span>{t("selectedRole")}</span>
        <StatusBadge>{t(roleLabels[role])}</StatusBadge>
      </div>
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField
          label="username"
          hint="usernameHint"
          input={{
            id: "register-username",
            autoComplete: "username",
            autoCapitalize: "none",
            ...register("username"),
          }}
          error={errors.username?.message}
        />
        <TextField
          label="password"
          kind="password"
          hint="passwordHint"
          input={{ id: "register-password", autoComplete: "new-password", ...register("password") }}
          error={errors.password?.message}
        />
        <TextField
          label="confirmPassword"
          kind="password"
          input={{
            id: "register-confirm",
            autoComplete: "new-password",
            ...register("confirmPassword"),
          }}
          error={errors.confirmPassword?.message}
        />
        <LanguageField id="register-language" {...register("preferredLanguage")} />
        <div className="consents">
          {(
            [
              ["acceptTerms", "/terms", "readTerms"],
              ["acceptPrivacyPolicy", "/privacy", "readPrivacy"],
            ] as const
          ).map(([field, url, label]) => (
            <div key={field}>
              <label>
                <input
                  type="checkbox"
                  {...register(field)}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? field + "-error" : undefined}
                />
                {t(field)}
              </label>
              <Link className="text-link" to={url} target="_blank" rel="noopener">
                {t(label)}
              </Link>
              {errors[field]?.message && (
                <p className="field-error" id={field + "-error"} role="alert">
                  {t(errors[field].message)}
                </p>
              )}
            </div>
          ))}
        </div>
        {errors.root?.message && (
          <p className="form-alert" role="alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button variant="outline" asChild>
            <Link to={"/register?role=" + role}>{t("back")}</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("create")}
          </Button>
        </div>
      </form>
      <p className="auth-alternate">
        {t("already")}{" "}
        <Link className="text-link" to="/login">
          {t("login")}
        </Link>
      </p>
    </>
  );
}
