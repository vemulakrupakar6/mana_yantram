import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { providersApi } from "@/api/providers.api";
import {
  ErrorState,
  FullPageLoader,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { TextField } from "@/components/forms/AuthFields";
import { FileUploadField } from "@/components/forms/FileUploadField";
import { ProviderProfileForm } from "@/components/provider/ProviderProfileForm";
import { ProviderStatusBadge, RemarkNotice } from "@/components/provider/ProviderParts";
import { Button } from "@/components/ui/button";
import { applyServerErrors, errorKey } from "@/features/auth/errors";
import { bankFormSchema, type BankFormValues } from "@/schemas/provider";
import type { ApiError } from "@/types/auth";
import type { ProviderDocumentRow, ReviewStatus } from "@/types/provider";

export const providerKey = ["provider-me"] as const;
export function useProviderMe() {
  return useQuery({
    queryKey: providerKey,
    queryFn: ({ signal }) => providersApi.me(signal),
    retry: false,
  });
}
export const profileMissing = (error: unknown) =>
  axios.isAxiosError<ApiError>(error) && error.response?.data?.code === "PROFILE_REQUIRED";

const reviewTone = (status: ReviewStatus) =>
  status === "ACCEPTED" ? "success" : status === "RETURNED" ? "warning" : "neutral";

export function ProviderProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useProviderMe();
  if (query.isPending) return <FullPageLoader />;
  if (profileMissing(query.error)) return <Navigate to="/onboarding" replace />;
  if (query.isError) return <ErrorState title={t("error")} retry={() => void query.refetch()} />;
  const provider = query.data;
  const returned = provider.status === "RETURNED" ? provider.latestReturn : null;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("providerProfile")} description={provider.providerNo}>
        <ProviderStatusBadge status={provider.status} />
      </PageHeader>
      {returned?.remarks && <RemarkNotice text={returned.remarks} />}
      <section className="panel dashboard-section">
        <ProviderProfileForm
          key={provider.id + provider.status}
          provider={provider}
          remarks={returned?.fieldRemarks}
          onSaved={async (saved) => {
            queryClient.setQueryData(providerKey, saved);
            void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
            toast.success(t("changesSaved"));
          }}
        />
      </section>
    </div>
  );
}

function DocumentItem({ row, locked }: { row: ProviderDocumentRow; locked: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (fileId: string) =>
      providersApi.putDocument({
        documentTypeCode: row.documentTypeCode,
        equipmentId: row.equipmentId ?? undefined,
        fileId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
      toast.success(t("documentSaved"));
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const name = (i18n.language === "te" && row.nameTe) || row.nameEn;
  const doc = row.document;
  const id = "doc-" + row.documentTypeCode + (row.equipmentId ?? "");
  return (
    <li className="document-item">
      <div className="document-head">
        <strong>{name}</strong>
        {row.equipmentLabel && <span className="muted"> · {row.equipmentLabel}</span>}
        {!row.required && <StatusBadge>{t("notRequired")}</StatusBadge>}
        <StatusBadge tone={doc ? reviewTone(doc.status) : "warning"}>
          {t(doc ? "review_" + doc.status : "notUploaded")}
        </StatusBadge>
      </div>
      {doc?.status === "RETURNED" && <RemarkNotice text={doc.remarks} />}
      <FileUploadField
        id={id}
        label={t("file")}
        value={null}
        current={doc?.file ?? null}
        disabled={locked || save.isPending}
        onChange={(file) => file && save.mutate(file.id)}
      />
    </li>
  );
}
export function ProviderDocumentsPage() {
  const { t } = useTranslation();
  const me = useProviderMe();
  const docs = useQuery({
    queryKey: ["provider-documents"],
    queryFn: ({ signal }) => providersApi.documents(signal),
    enabled: me.isSuccess,
  });
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError || docs.isError)
    return <ErrorState title={t("error")} retry={() => void docs.refetch()} />;
  if (docs.isPending) return <FullPageLoader />;
  const { editable } = me.data;
  return (
    <div className="dashboard-content">
      <PageHeader title={t("providerDocuments")} description={t("documentsIntro")}>
        <ProviderStatusBadge status={me.data.status} />
      </PageHeader>
      {!editable.profile && <p className="dash-notice">{t("documentsLocked")}</p>}
      <section className="panel dashboard-section">
        <ul className="document-list">
          {docs.data.map((row) => (
            <DocumentItem
              key={row.documentTypeCode + (row.equipmentId ?? "")}
              row={row}
              locked={row.scope === "EQUIPMENT" ? !editable.equipment : !editable.profile}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ProviderBankPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useProviderMe();
  const [directory, setDirectory] = useState<string | null>(null);
  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: { holderName: "", accountNumber: "", confirmAccountNumber: "", ifsc: "" },
  });
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = form;
  if (me.isPending) return <FullPageLoader />;
  if (profileMissing(me.error)) return <Navigate to="/onboarding" replace />;
  if (me.isError) return <ErrorState title={t("error")} retry={() => void me.refetch()} />;
  const provider = me.data;
  const bank = provider.bankAccount;
  const locked = !provider.editable.profile;
  const submit = handleSubmit(async (values) => {
    try {
      await providersApi.saveBank({ ...values, ifsc: values.ifsc.toUpperCase() });
      await queryClient.invalidateQueries({ queryKey: providerKey });
      void queryClient.invalidateQueries({ queryKey: ["provider-checklist"] });
      reset({
        holderName: values.holderName,
        accountNumber: "",
        confirmAccountNumber: "",
        ifsc: values.ifsc,
      });
      toast.success(t("changesSaved"));
    } catch (error) {
      if (!applyServerErrors(error, setError)) setError("root", { message: errorKey(error) });
    }
  });
  return (
    <div className="dashboard-content">
      <PageHeader title={t("bankAccount")} description={t("bankIntro")}>
        <ProviderStatusBadge status={provider.status} />
      </PageHeader>
      {bank && (
        <section className="panel dashboard-section">
          <dl className="account-facts">
            <div>
              <dt>{t("accountHolder")}</dt>
              <dd>{bank.holderName}</dd>
            </div>
            <div>
              <dt>{t("accountNumber")}</dt>
              <dd>{bank.accountNumber}</dd>
            </div>
            <div>
              <dt>{t("ifsc")}</dt>
              <dd>
                {bank.ifsc}
                {bank.bankName ? ` · ${bank.bankName}, ${bank.branchName ?? ""}` : ""}
              </dd>
            </div>
            <div>
              <dt>{t("status")}</dt>
              <dd>
                <StatusBadge tone={reviewTone(bank.status)}>
                  {t("review_" + bank.status)}
                </StatusBadge>
              </dd>
            </div>
          </dl>
          {bank.status === "RETURNED" && <RemarkNotice text={bank.remarks} />}
        </section>
      )}
      <section className="panel dashboard-section">
        {locked ? (
          <p className="muted">{t("bankLocked")}</p>
        ) : (
          <form className="form-stack" onSubmit={submit} noValidate>
            <h2>{t(bank ? "replaceBank" : "addBank")}</h2>
            <div className="form-grid">
              <TextField
                label="accountHolder"
                input={{ id: "bank-holder", ...register("holderName") }}
                error={errors.holderName?.message}
              />
              <TextField
                label="accountNumber"
                input={{
                  id: "bank-number",
                  inputMode: "numeric",
                  autoComplete: "off",
                  ...register("accountNumber"),
                }}
                error={errors.accountNumber?.message}
              />
              <TextField
                label="confirmAccountNumber"
                input={{
                  id: "bank-confirm",
                  inputMode: "numeric",
                  autoComplete: "off",
                  onPaste: (event) => event.preventDefault(),
                  ...register("confirmAccountNumber"),
                }}
                error={errors.confirmAccountNumber?.message}
              />
              <TextField
                label="ifsc"
                hint={directory ? undefined : "ifscHint"}
                input={{
                  id: "bank-ifsc",
                  autoCapitalize: "characters",
                  autoComplete: "off",
                  ...register("ifsc", {
                    onBlur: async (event) => {
                      const code = String(event.target.value).trim().toUpperCase();
                      setDirectory(null);
                      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
                        const found = await providersApi.ifsc(code);
                        if (found) setDirectory(`${found.bank}, ${found.branch}`);
                      }
                    },
                  }),
                }}
                error={errors.ifsc?.message}
              />
            </div>
            {directory && <p className="field-hint">{directory}</p>}
            <p className="field-hint">{t("bankVerifiedManually")}</p>
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
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
