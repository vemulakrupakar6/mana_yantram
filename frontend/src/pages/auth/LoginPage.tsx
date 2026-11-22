import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { TextField } from "@/components/forms/AuthFields";
import { LoadingSpinner, PageHeader } from "@/components/common/shared";
import { Button } from "@/components/ui/button";
import { loginSchema, type LoginInput } from "@/schemas/auth";
import { login } from "@/features/auth/session";
import { errorKey } from "@/features/auth/errors";

export function LoginPage() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const submit = handleSubmit(async (input) => {
    try {
      await login(input);
    } catch (error) {
      setError("root", { message: errorKey(error) });
    }
  });
  return (
    <>
      <PageHeader title={t("welcomeBack")} description={t("loginIntro")} />
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField
          label="username"
          input={{
            id: "login-username",
            autoComplete: "username",
            autoCapitalize: "none",
            ...register("username"),
          }}
          error={errors.username?.message}
        />
        <TextField
          label="password"
          kind="password"
          input={{
            id: "login-password",
            autoComplete: "current-password",
            ...register("password"),
          }}
          error={errors.password?.message}
        />
        {errors.root?.message && (
          <p className="form-alert" role="alert">
            {t(errors.root.message)}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <LoadingSpinner />}
          {t("signIn")}
        </Button>
      </form>
      <p className="auth-alternate">
        {t("newHere")}{" "}
        <Link className="text-link" to="/register">
          {t("create")}
        </Link>
      </p>
    </>
  );
}
