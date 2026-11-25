import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminUsersApi } from "@/api/admin-users.api";
import { DataTable, Pagination, type Column } from "@/components/common/DataTable";
import {
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { FormField, SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/AuthFields";
import { GeoSelect } from "@/components/forms/GeoSelect";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { departmentRoles, roleLevel } from "@/constants/roles";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { createUserSchema, reasonSchema, resetSchema, type CreateUserForm } from "@/schemas/admin";
import { useAuth } from "@/stores/auth";
import { roleLabels, type RoleCode } from "@/types/auth";
import type { AdminUser } from "@/types/admin";
import { generateTemporaryPassword } from "@/utils/password";

const tone = (status: AdminUser["status"]) => (status === "ACTIVE" ? "success" : "warning");
const pageSize = 20;

function useJurisdictionLabel() {
  const { t } = useTranslation();
  return (user: AdminUser) => (user.jurisdiction ? t("level" + user.jurisdiction.level) : "—");
}

export function UserListPage() {
  const { t } = useTranslation();
  const label = useJurisdictionLabel();
  const [filters, setFilters] = useState({ search: "", role: "", status: "" });
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin-users", filters, page],
    queryFn: ({ signal }) => adminUsersApi.list({ ...filters, page, pageSize }, signal),
    placeholderData: keepPreviousData,
  });
  const columns: Column<AdminUser>[] = [
    {
      key: "username",
      header: "username",
      render: (user) => (
        <Link className="text-link" to={"/admin/users/" + user.id}>
          {user.username}
        </Link>
      ),
    },
    { key: "name", header: "displayName", render: (user) => user.displayName ?? "—" },
    {
      key: "roles",
      header: "roles",
      render: (user) => user.roles.map((role) => t(roleLabels[role])).join(", "),
    },
    { key: "level", header: "jurisdiction", render: label },
    {
      key: "status",
      header: "status",
      render: (user) => (
        <StatusBadge tone={tone(user.status)}>{t("account" + user.status)}</StatusBadge>
      ),
    },
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("userRoles")} description={t("usersIntro")}>
        <Button asChild>
          <Link to="/admin/users/new">{t("createUser")}</Link>
        </Button>
      </PageHeader>
      <section className="panel dashboard-section">
        <form
          className="filter-row"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPage(1);
            setFilters({
              search: String(data.get("search") ?? ""),
              role: String(data.get("role") ?? ""),
              status: String(data.get("status") ?? ""),
            });
          }}
        >
          <FormField id="filter-search" label={t("search")}>
            <Input id="filter-search" name="search" defaultValue={filters.search} />
          </FormField>
          <FormField id="filter-role" label={t("role")}>
            <SelectField id="filter-role" name="role" defaultValue={filters.role}>
              <option value="">{t("all")}</option>
              {(Object.keys(roleLabels) as RoleCode[]).map((role) => (
                <option key={role} value={role}>
                  {t(roleLabels[role])}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField id="filter-status" label={t("status")}>
            <SelectField id="filter-status" name="status" defaultValue={filters.status}>
              <option value="">{t("all")}</option>
              {["ACTIVE", "INACTIVE", "SUSPENDED"].map((status) => (
                <option key={status} value={status}>
                  {t("account" + status)}
                </option>
              ))}
            </SelectField>
          </FormField>
          <Button type="submit" variant="outline">
            {t("applyFilters")}
          </Button>
        </form>
        {query.isPending ? (
          <FullPageLoader />
        ) : query.isError ? (
          <ErrorState title={t("error")} retry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable columns={columns} rows={query.data.items} empty={t("noUsers")} />
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

function PasswordGenerator({ onGenerate }: { onGenerate: (password: string) => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" onClick={() => onGenerate(generateTemporaryPassword())}>
      {t("generatePassword")}
    </Button>
  );
}
function OneTimeSecret({ username, password }: { username: string; password: string }) {
  const { t } = useTranslation();
  return (
    <div className="panel dashboard-section" role="status">
      <h2>{t("shareOnce")}</h2>
      <p className="muted">{t("shareOnceBody")}</p>
      <dl className="account-facts">
        <div>
          <dt>{t("username")}</dt>
          <dd>{username}</dd>
        </div>
        <div>
          <dt>{t("temporaryPassword")}</dt>
          <dd className="secret-box">{password}</dd>
        </div>
      </dl>
    </div>
  );
}

export function UserCreatePage() {
  const { t } = useTranslation();
  const caller = useAuth((state) => state.user)!;
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const ceiling = Math.max(0, ...caller.roles.map((role) => roleLevel[role]));
  const grantable = departmentRoles.filter((role) => roleLevel[role] <= ceiling);
  const scope = caller.jurisdiction;
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      displayName: "",
      mobile: "",
      role: "",
      level: scope?.level === "STATE" ? "DISTRICT" : (scope?.level ?? "DISTRICT"),
      districtId: scope?.districtId ?? "",
      mandalId: scope?.mandalId ?? "",
      temporaryPassword: "",
    },
  });
  const [role, level, districtId, mandalId] = useWatch({
    control,
    name: ["role", "level", "districtId", "mandalId"],
  });
  const adminRole = role === "SUPER_ADMIN" || role === "STATE_ADMIN";
  const submit = handleSubmit(async (input) => {
    try {
      const effectiveLevel = adminRole ? "STATE" : input.level;
      await adminUsersApi.create({
        username: input.username,
        displayName: input.displayName,
        mobile: input.mobile || undefined,
        role: input.role,
        jurisdiction: {
          level: effectiveLevel,
          districtId: effectiveLevel === "STATE" ? undefined : input.districtId,
          mandalId: effectiveLevel === "MANDAL" ? input.mandalId : undefined,
        },
        temporaryPassword: input.temporaryPassword,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCreated({ username: input.username, password: input.temporaryPassword });
      toast.success(t("userCreated"));
    } catch (error) {
      const key = errorKey(error);
      if (key === "usernameTaken") setError("username", { message: key });
      else if (key === "mobileTaken") setError("mobile", { message: key });
      else if (!applyServerErrors(error, setError)) setError("root", { message: key });
    }
  });
  if (created)
    return (
      <div className="dashboard-content">
        <PageHeader title={t("createUser")} />
        <OneTimeSecret {...created} />
        <div className="form-actions">
          <Button asChild>
            <Link to="/admin/users">{t("backToUsers")}</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <div className="dashboard-content">
      <PageHeader title={t("createUser")} description={t("createUserIntro")} />
      <form className="panel dashboard-section form-stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <TextField
            label="username"
            input={{ id: "new-username", autoCapitalize: "none", ...register("username") }}
            error={errors.username?.message}
          />
          <TextField
            label="displayName"
            input={{ id: "new-name", ...register("displayName") }}
            error={errors.displayName?.message}
          />
          <TextField
            label="mobile"
            input={{ id: "new-mobile", type: "tel", inputMode: "numeric", ...register("mobile") }}
            error={errors.mobile?.message}
          />
          <FormField
            id="new-role"
            label={t("role")}
            error={errors.role?.message ? t(errors.role.message) : undefined}
          >
            <SelectField id="new-role" {...register("role")}>
              <option value="">{t("choose")}</option>
              {grantable.map((value) => (
                <option key={value} value={value}>
                  {t(roleLabels[value])}
                </option>
              ))}
            </SelectField>
          </FormField>
        </div>
        {role && !adminRole && (
          <fieldset className="form-stack">
            <legend>{t("jurisdiction")}</legend>
            <FormField id="new-level" label={t("jurisdictionLevel")}>
              <SelectField
                id="new-level"
                {...register("level", {
                  onChange: () => {
                    setValue("mandalId", "");
                    if (scope?.level !== "DISTRICT" && scope?.level !== "MANDAL")
                      setValue("districtId", "");
                  },
                })}
              >
                {scope?.level === "STATE" && <option value="DISTRICT">{t("levelDISTRICT")}</option>}
                <option value="MANDAL">{t("levelMANDAL")}</option>
              </SelectField>
            </FormField>
            <Controller
              control={control}
              name="districtId"
              render={() => (
                <div className="form-grid">
                  <GeoSelect
                    idPrefix="new-geo"
                    upTo={level === "MANDAL" ? "mandal" : "district"}
                    disabled={scope?.level !== "STATE"}
                    value={{ districtId, mandalId, villageId: "" }}
                    onChange={(next) => {
                      setValue("districtId", next.districtId, { shouldValidate: true });
                      setValue("mandalId", next.mandalId, { shouldValidate: true });
                    }}
                    errors={{
                      districtId: errors.districtId?.message,
                      mandalId: errors.mandalId?.message,
                    }}
                  />
                </div>
              )}
            />
          </fieldset>
        )}
        <TextField
          label="temporaryPassword"
          hint="temporaryPasswordHint"
          input={{ id: "new-password", autoComplete: "off", ...register("temporaryPassword") }}
          error={errors.temporaryPassword?.message}
        />
        <div>
          <PasswordGenerator
            onGenerate={(password) =>
              setValue("temporaryPassword", password, { shouldValidate: true })
            }
          />
        </div>
        {errors.root?.message && (
          <p role="alert" className="form-alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("createUser")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/users">{t("cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

export function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const label = useJurisdictionLabel();
  const [secret, setSecret] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const query = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: ({ signal }) => adminUsersApi.get(userId, signal),
    retry: false,
  });
  const refresh = (user: AdminUser) => {
    queryClient.setQueryData(["admin-user", userId], user);
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };
  const fail = (error: unknown) => toast.error(t(errorKey(error)));
  const deactivate = useMutation({
    mutationFn: () => adminUsersApi.deactivate(userId, reasonSchema.parse({ reason }).reason),
    onSuccess: (user) => {
      refresh(user);
      setReason("");
      toast.success(t("userDeactivated"));
    },
    onError: fail,
  });
  const reactivate = useMutation({
    mutationFn: () => adminUsersApi.reactivate(userId),
    onSuccess: (user) => {
      refresh(user);
      toast.success(t("userReactivated"));
    },
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: (value: string) =>
      adminUsersApi.resetPassword(
        userId,
        resetSchema.parse({ temporaryPassword: value }).temporaryPassword,
      ),
    onSuccess: (user, value) => {
      refresh(user);
      setSecret(value);
      setPassword("");
      toast.success(t("passwordResetDone"));
    },
    onError: fail,
  });
  if (query.isPending) return <FullPageLoader />;
  if (query.isError) {
    const missing = errorKey(query.error) === "notFound";
    return (
      <ErrorState
        title={t(missing ? "notFound" : "error")}
        retry={missing ? () => navigate("/admin/users") : () => void query.refetch()}
      />
    );
  }
  const user = query.data;
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language === "te" ? "te-IN" : "en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  const reasonOk = reasonSchema.safeParse({ reason }).success;
  const passwordOk = resetSchema.safeParse({ temporaryPassword: password }).success;
  return (
    <div className="dashboard-content">
      <PageHeader title={user.displayName || user.username}>
        <Button variant="outline" asChild>
          <Link to="/admin/users">{t("backToUsers")}</Link>
        </Button>
      </PageHeader>
      <section className="panel dashboard-section">
        <dl className="account-facts">
          <div>
            <dt>{t("username")}</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>{t("roles")}</dt>
            <dd>
              {user.roles.map((role) => (
                <StatusBadge key={role}>{t(roleLabels[role])}</StatusBadge>
              ))}
            </dd>
          </div>
          <div>
            <dt>{t("status")}</dt>
            <dd>
              <StatusBadge tone={tone(user.status)}>{t("account" + user.status)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{t("jurisdiction")}</dt>
            <dd>{label(user)}</dd>
          </div>
          <div>
            <dt>{t("mobile")}</dt>
            <dd>{user.mobile ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("lastLogin")}</dt>
            <dd>{date(user.lastLoginAt)}</dd>
          </div>
          {user.mustChangePassword && (
            <div>
              <dt>{t("password")}</dt>
              <dd>
                <StatusBadge tone="warning">{t("mustChangePassword")}</StatusBadge>
              </dd>
            </div>
          )}
          {user.deactivatedAt && (
            <div>
              <dt>{t("deactivationReason")}</dt>
              <dd>
                {user.deactivationReason} · {date(user.deactivatedAt)}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section className="panel dashboard-section form-stack">
        <h2>{user.status === "ACTIVE" ? t("deactivate") : t("reactivate")}</h2>
        {user.status === "ACTIVE" ? (
          <>
            <TextField
              label="deactivationReason"
              input={{
                id: "deactivate-reason",
                value: reason,
                onChange: (event) => setReason(event.target.value),
                maxLength: 300,
              }}
            />
            <div className="form-actions">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={!reasonOk || deactivate.isPending}>
                    {t("deactivate")}
                  </Button>
                }
                title={t("confirmDeactivate")}
                description={t("deactivateBody")}
                action={t("deactivate")}
                onConfirm={() => deactivate.mutate()}
              />
            </div>
          </>
        ) : (
          <div className="form-actions">
            <Button onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
              {t("reactivate")}
            </Button>
          </div>
        )}
      </section>
      <section className="panel dashboard-section form-stack">
        <h2>{t("resetPassword")}</h2>
        <p className="muted">{t("resetPasswordBody")}</p>
        <TextField
          label="temporaryPassword"
          hint="temporaryPasswordHint"
          input={{
            id: "reset-password",
            autoComplete: "off",
            value: password,
            onChange: (event) => setPassword(event.target.value),
          }}
        />
        <div className="inline-actions">
          <PasswordGenerator onGenerate={setPassword} />
          <ConfirmDialog
            trigger={
              <Button disabled={!passwordOk || reset.isPending}>{t("resetPassword")}</Button>
            }
            title={t("confirmReset")}
            description={t("confirmResetBody")}
            action={t("resetPassword")}
            onConfirm={() => reset.mutate(password)}
          />
        </div>
        {secret && <OneTimeSecret username={user.username} password={secret} />}
      </section>
    </div>
  );
}
