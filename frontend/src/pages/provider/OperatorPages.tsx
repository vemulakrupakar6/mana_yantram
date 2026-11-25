import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { equipmentApi } from "@/api/equipment.api";
import type { FileRef } from "@/api/files.api";
import { operatorsApi } from "@/api/operations.api";
import { DataTable, type Column } from "@/components/common/DataTable";
import {
  EmptyState,
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { FileUploadField } from "@/components/forms/FileUploadField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { profileMissing, useProviderMe } from "@/pages/provider/ProviderPages";
import { temporaryPassword as passwordRule, mobileField } from "@/schemas/admin";
import type { Operator } from "@/types/operations";
import { generateTemporaryPassword } from "@/utils/password";

const listKey = ["provider-operators"] as const;
const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9._-]{3,50}$/, "usernameInvalid"));
const createSchema = z.object({
  fullName: z.string().trim().min(2, "required").max(150, "tooLong"),
  mobile: mobileField.refine((v) => v !== "", "required"),
  username,
  temporaryPassword: passwordRule,
  licenceNo: z
    .string()
    .trim()
    .refine((v) => !v || v.length >= 3, "licenceInvalid"),
});
type CreateValues = z.infer<typeof createSchema>;
const editSchema = createSchema.pick({ fullName: true, mobile: true, licenceNo: true });
type EditValues = z.infer<typeof editSchema>;

function EquipmentChecks({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const equipment = useQuery({
    queryKey: ["provider-equipment"],
    queryFn: ({ signal }) => equipmentApi.list(signal),
  });
  if (equipment.isPending) return <LoadingSpinner />;
  if (!equipment.data?.length) return <p className="muted">{t("noEquipmentToAssign")}</p>;
  return (
    <fieldset className="check-group" disabled={disabled}>
      <legend>{t("assignedEquipment")}</legend>
      {equipment.data.map((e) => (
        <label className="check-row" key={e.id}>
          <input
            type="checkbox"
            checked={selected.includes(e.id)}
            onChange={(event) =>
              onChange(
                event.target.checked ? [...selected, e.id] : selected.filter((id) => id !== e.id),
              )
            }
          />
          {e.make} {e.model} ({e.year})
        </label>
      ))}
    </fieldset>
  );
}
function OneTimeSecret({ username: name, password }: { username: string; password: string }) {
  const { t } = useTranslation();
  return (
    <section className="panel dashboard-section credentials-print" role="status">
      <h2>{t("shareOnce")}</h2>
      <p className="muted">{t("operatorShareBody")}</p>
      <dl className="account-facts">
        <div>
          <dt>{t("username")}</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>{t("temporaryPassword")}</dt>
          <dd className="secret-box">{password}</dd>
        </div>
      </dl>
      <Button variant="outline" className="no-print" onClick={() => window.print()}>
        {t("print")}
      </Button>
    </section>
  );
}

export function OperatorListPage() {
  const { t } = useTranslation();
  const me = useProviderMe();
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => operatorsApi.list(signal),
    enabled: me.isSuccess,
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError || list.isError)
    return <ErrorState title={t("error")} retry={() => void list.refetch()} />;
  const columns: Column<Operator>[] = [
    {
      key: "name",
      header: "fullName",
      render: (o) => (
        <Link className="text-link" to={"/provider/operators/" + o.id}>
          {o.fullName}
        </Link>
      ),
    },
    { key: "username", header: "username", render: (o) => o.username },
    { key: "mobile", header: "mobile", render: (o) => o.mobile ?? "—" },
    { key: "equipment", header: "assignedEquipment", render: (o) => o.equipment.length },
    {
      key: "status",
      header: "status",
      render: (o) => (
        <StatusBadge tone={o.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + o.status)}
        </StatusBadge>
      ),
    },
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("operators")} description={t("operatorsIntro")}>
        {me.data.editable.operators && (
          <Button asChild>
            <Link to="/provider/operators/new">{t("addOperator")}</Link>
          </Button>
        )}
      </PageHeader>
      <section className="panel dashboard-section">
        {list.isPending ? (
          <FullPageLoader />
        ) : list.data.length ? (
          <DataTable columns={columns} rows={list.data} empty={t("noOperators")} />
        ) : (
          <EmptyState title={t("noOperators")} />
        )}
      </section>
    </div>
  );
}

export function OperatorNewPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [licence, setLicence] = useState<FileRef | null>(null);
  const [done, setDone] = useState<{ operator: Operator; password: string } | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: "", mobile: "", username: "", temporaryPassword: "", licenceNo: "" },
  });
  const {
    register,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  if (!me.data.editable.operators) return <Navigate to="/provider/operators" replace />;
  const submit = handleSubmit(async (v) => {
    try {
      const operator = await operatorsApi.create({
        fullName: v.fullName.trim(),
        mobile: v.mobile.trim(),
        username: v.username,
        temporaryPassword: v.temporaryPassword,
        ...(v.licenceNo.trim() ? { licenceNo: v.licenceNo.trim() } : {}),
        ...(licence ? { licenceFileId: licence.id } : {}),
        ...(equipmentIds.length ? { equipmentIds } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ["provider-me"] });
      toast.success(t("operatorCreated"));
      setDone({ operator, password: v.temporaryPassword });
    } catch (error) {
      const key = errorKey(error);
      if (key === "usernameTaken") setError("username", { message: key });
      else if (key === "mobileTaken") setError("mobile", { message: key });
      else if (!applyServerErrors(error, setError)) setError("root", { message: key });
    }
  });
  if (done)
    return (
      <div className="dashboard-content">
        <PageHeader title={done.operator.fullName} description={t("operatorCreated")} />
        <OneTimeSecret username={done.operator.username} password={done.password} />
        <div className="form-actions no-print">
          <Button asChild>
            <Link to={"/provider/operators/" + done.operator.id}>{t("viewOperator")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/provider/operators">{t("backToList")}</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <div className="dashboard-content">
      <PageHeader title={t("addOperator")} description={t("addOperatorIntro")} />
      <form className="panel dashboard-section form-stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <TextField
            label="fullName"
            input={{ id: "op-name", ...register("fullName") }}
            error={errors.fullName?.message}
          />
          <TextField
            label="mobile"
            hint="mobileHint10"
            input={{ id: "op-mobile", type: "tel", inputMode: "numeric", ...register("mobile") }}
            error={errors.mobile?.message}
          />
          <TextField
            label="username"
            input={{ id: "op-username", autoCapitalize: "none", ...register("username") }}
            error={errors.username?.message}
          />
          <TextField
            label="temporaryPassword"
            hint="temporaryPasswordHint"
            input={{ id: "op-password", autoComplete: "off", ...register("temporaryPassword") }}
            error={errors.temporaryPassword?.message}
          />
          <TextField
            label="licenceNoOptional"
            input={{ id: "op-licence", ...register("licenceNo") }}
            error={errors.licenceNo?.message}
          />
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setValue("temporaryPassword", generateTemporaryPassword(), { shouldValidate: true })
            }
          >
            {t("generatePassword")}
          </Button>
        </div>
        <FileUploadField
          id="op-licence-file"
          label={t("licenceFileOptional")}
          value={licence}
          onChange={setLicence}
        />
        <EquipmentChecks selected={equipmentIds} onChange={setEquipmentIds} />
        {errors.root?.message && (
          <p role="alert" className="form-alert">
            {t(errors.root.message)}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("addOperator")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/provider/operators">{t("cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

export function OperatorDetailPage() {
  const { t } = useTranslation();
  const { operatorId = "" } = useParams();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const [secret, setSecret] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const query = useQuery({
    queryKey: ["provider-operator", operatorId],
    queryFn: ({ signal }) => operatorsApi.get(operatorId, signal),
    retry: false,
  });
  const refresh = (operator: Operator) => {
    queryClient.setQueryData(["provider-operator", operatorId], operator);
    void queryClient.invalidateQueries({ queryKey: listKey });
  };
  const fail = (error: unknown) => toast.error(t(errorKey(error)));
  const setActive = useMutation({
    mutationFn: (active: boolean) => operatorsApi.setActive(operatorId, active),
    onSuccess: (o) => {
      refresh(o);
      toast.success(t(o.status === "ACTIVE" ? "operatorActivated" : "operatorDeactivated"));
    },
    onError: fail,
  });
  const assign = useMutation({
    mutationFn: (ids: string[]) => operatorsApi.setEquipment(operatorId, ids),
    onSuccess: (o) => {
      refresh(o);
      toast.success(t("changesSaved"));
    },
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: (value: string) => operatorsApi.resetPassword(operatorId, value),
    onSuccess: (o, value) => {
      refresh(o);
      setSecret(value);
      setPassword("");
      toast.success(t("passwordResetDone"));
    },
    onError: fail,
  });
  if (me.isPending || query.isPending) return <FullPageLoader />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  const operator = query.data;
  const locked = !me.data?.editable.operators;
  return (
    <div className="dashboard-content">
      <PageHeader title={operator.fullName} description={operator.username}>
        <StatusBadge tone={operator.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + operator.status)}
        </StatusBadge>
        <Button variant="outline" asChild>
          <Link to="/provider/operators">{t("back")}</Link>
        </Button>
      </PageHeader>
      {locked && <p className="dash-notice">{t("operatorsLocked")}</p>}
      <section className="panel dashboard-section">
        <EditForm
          key={
            operator.id +
            operator.fullName +
            operator.mobile +
            operator.licenceNo +
            operator.licenceFile?.id
          }
          operator={operator}
          locked={locked}
          onSaved={refresh}
        />
      </section>
      <section className="panel dashboard-section form-stack">
        <EquipmentAssignment
          key={operator.equipment.map((e) => e.id).join()}
          operator={operator}
          locked={locked || assign.isPending}
          onSave={(ids) => assign.mutate(ids)}
        />
      </section>
      {!locked && (
        <>
          <section className="panel dashboard-section form-stack">
            <h2>{t(operator.status === "ACTIVE" ? "deactivate" : "activate")}</h2>
            <p className="muted">
              {t(operator.status === "ACTIVE" ? "operatorDeactivateBody" : "operatorActivateBody")}
            </p>
            <div className="form-actions">
              {operator.status === "ACTIVE" ? (
                <ConfirmDialog
                  trigger={<Button variant="outline">{t("deactivate")}</Button>}
                  title={t("confirmDeactivate")}
                  description={t("operatorDeactivateBody")}
                  action={t("deactivate")}
                  onConfirm={() => setActive.mutate(false)}
                />
              ) : (
                <Button onClick={() => setActive.mutate(true)}>{t("activate")}</Button>
              )}
            </div>
          </section>
          <section className="panel dashboard-section form-stack">
            <h2>{t("resetPassword")}</h2>
            <p className="muted">{t("resetPasswordBody")}</p>
            <TextField
              label="temporaryPassword"
              hint="temporaryPasswordHint"
              input={{
                id: "op-reset",
                autoComplete: "off",
                value: password,
                onChange: (e) => setPassword(e.target.value),
              }}
            />
            <div className="inline-actions">
              <Button variant="outline" onClick={() => setPassword(generateTemporaryPassword())}>
                {t("generatePassword")}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button disabled={password.length < 12 || reset.isPending}>
                    {t("resetPassword")}
                  </Button>
                }
                title={t("confirmReset")}
                description={t("confirmResetBody")}
                action={t("resetPassword")}
                onConfirm={() => reset.mutate(password)}
              />
            </div>
            {secret && <OneTimeSecret username={operator.username} password={secret} />}
          </section>
        </>
      )}
    </div>
  );
}

function EditForm({
  operator,
  locked,
  onSaved,
}: {
  operator: Operator;
  locked: boolean;
  onSaved: (o: Operator) => void;
}) {
  const { t } = useTranslation();
  const [licence, setLicence] = useState<FileRef | null>(null);
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      fullName: operator.fullName,
      mobile: operator.mobile ?? "",
      licenceNo: operator.licenceNo ?? "",
    },
  });
  const {
    register,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const submit = handleSubmit(async (v) => {
    try {
      const saved = await operatorsApi.update(operator.id, {
        fullName: v.fullName.trim(),
        mobile: v.mobile.trim(),
        licenceNo: v.licenceNo.trim() || null,
        ...(licence ? { licenceFileId: licence.id } : {}),
      });
      setLicence(null);
      onSaved(saved);
      toast.success(t("changesSaved"));
    } catch (error) {
      const key = errorKey(error);
      if (key === "mobileTaken") setError("mobile", { message: key });
      else if (!applyServerErrors(error, setError)) setError("root", { message: key });
    }
  });
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <fieldset className="form-stack" disabled={locked}>
        <div className="form-grid">
          <TextField
            label="fullName"
            input={{ id: "op-edit-name", ...register("fullName") }}
            error={errors.fullName?.message}
          />
          <TextField
            label="mobile"
            input={{
              id: "op-edit-mobile",
              type: "tel",
              inputMode: "numeric",
              ...register("mobile"),
            }}
            error={errors.mobile?.message}
          />
          <TextField
            label="licenceNoOptional"
            input={{ id: "op-edit-licence", ...register("licenceNo") }}
            error={errors.licenceNo?.message}
          />
        </div>
        <FileUploadField
          id="op-edit-file"
          label={t("licenceFileOptional")}
          value={licence}
          current={operator.licenceFile}
          onChange={setLicence}
          disabled={locked}
        />
      </fieldset>
      {errors.root?.message && (
        <p role="alert" className="form-alert">
          {t(errors.root.message)}
        </p>
      )}
      {!locked && (
        <div className="form-actions">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <LoadingSpinner />}
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
function EquipmentAssignment({
  operator,
  locked,
  onSave,
}: {
  operator: Operator;
  locked: boolean;
  onSave: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [ids, setIds] = useState(operator.equipment.map((e) => e.id));
  return (
    <>
      <EquipmentChecks selected={ids} onChange={setIds} disabled={locked} />
      {!locked && (
        <div className="form-actions">
          <Button onClick={() => onSave(ids)}>{t("save")}</Button>
        </div>
      )}
    </>
  );
}
