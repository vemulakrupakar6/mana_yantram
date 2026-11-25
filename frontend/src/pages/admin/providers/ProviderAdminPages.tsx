import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminProvidersApi } from "@/api/admin-providers.api";
import { openFile } from "@/api/files.api";
import { DataTable, Pagination, type Column } from "@/components/common/DataTable";
import {
  EmptyState,
  ErrorState,
  FullPageLoader,
  PageHeader,
  StatusBadge,
} from "@/components/common/shared";
import { FormField, SelectField } from "@/components/forms/fields";
import { GeoSelect, emptyGeo } from "@/components/forms/GeoSelect";
import { ProviderStatusBadge, RemarkNotice } from "@/components/provider/ProviderParts";
import { VerificationTimeline } from "@/components/provider/VerificationTimeline";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { RemarksDialog } from "@/components/ui/remarks-dialog";
import { permissions } from "@/constants/roles";
import { errorKey } from "@/features/auth/errors";
import { useLocalizedName } from "@/hooks/useLocalizedName";
import { useAuth } from "@/stores/auth";
import type { FieldRemarks, ProviderDocumentRow, ProviderStatus } from "@/types/provider";
import { providerTypes } from "@/types/provider";
import type { AdminProviderDetail, AdminProviderRow, ReviewEquipment } from "@/types/verification";
import { paiseToRupees } from "@/utils/money";

const tabs: ProviderStatus[] = [
  "SUBMITTED",
  "RETURNED",
  "APPROVED",
  "SUSPENDED",
  "REJECTED",
  "BLACKLISTED",
  "DRAFT",
];

/* ---------------------------------- queue ---------------------------------- */

export function AdminProvidersPage() {
  const { t, i18n } = useTranslation();
  const name = useLocalizedName();
  const scope = useAuth((s) => s.user!.jurisdiction);
  const [params, setParams] = useSearchParams();
  const status = (
    tabs.includes(params.get("status") as ProviderStatus) ? params.get("status") : "SUBMITTED"
  ) as ProviderStatus;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", type: "" });
  const [geo, setGeo] = useState(emptyGeo);
  const query = useQuery({
    queryKey: ["admin-providers", status, filters, geo.districtId, page],
    queryFn: ({ signal }) =>
      adminProvidersApi.list({ status, ...filters, districtId: geo.districtId, page }, signal),
    placeholderData: keepPreviousData,
  });
  const format = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language === "te" ? "te-IN" : "en-IN", {
          dateStyle: "medium",
        }).format(new Date(iso))
      : "—";
  const columns: Column<AdminProviderRow>[] = [
    {
      key: "no",
      header: "providerNo",
      render: (p) => (
        <Link className="text-link" to={"/admin/providers/" + p.id}>
          {p.providerNo}
        </Link>
      ),
    },
    { key: "name", header: "unitName", render: (p) => p.name },
    { key: "type", header: "providerType", render: (p) => t("type_" + p.type) },
    { key: "place", header: "village", render: (p) => `${name(p.mandal)}, ${name(p.district)}` },
    { key: "submitted", header: "submittedOn", render: (p) => format(p.submittedAt) },
    { key: "pending", header: "pendingItems", render: (p) => p.pendingDocs },
    { key: "status", header: "status", render: (p) => <ProviderStatusBadge status={p.status} /> },
  ];
  return (
    <div className="dashboard-content">
      <PageHeader title={t("providers")} description={t("adminProvidersIntro")} />
      <div role="tablist" className="tab-list" aria-label={t("providers")}>
        {tabs.map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={status === value}
            className={"tab" + (status === value ? " active" : "")}
            onClick={() => {
              setPage(1);
              setParams({ status: value }, { replace: true });
            }}
          >
            {t("provider" + value)}
          </button>
        ))}
      </div>
      <section className="panel dashboard-section">
        <form
          className="filter-row"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPage(1);
            setFilters({
              search: String(data.get("search") ?? ""),
              type: String(data.get("type") ?? ""),
            });
          }}
        >
          <FormField id="pq-search" label={t("search")}>
            <Input
              id="pq-search"
              name="search"
              placeholder={t("providerSearchHint")}
              defaultValue={filters.search}
            />
          </FormField>
          <FormField id="pq-type" label={t("providerType")}>
            <SelectField id="pq-type" name="type" defaultValue={filters.type}>
              <option value="">{t("all")}</option>
              {providerTypes.map((v) => (
                <option key={v} value={v}>
                  {t("type_" + v)}
                </option>
              ))}
            </SelectField>
          </FormField>
          {scope?.level === "STATE" && (
            <GeoSelect
              idPrefix="pq-geo"
              upTo="district"
              value={geo}
              onChange={(next) => {
                setGeo(next);
                setPage(1);
              }}
            />
          )}
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
            <DataTable columns={columns} rows={query.data.items} empty={t("noProviders")} />
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

/* --------------------------------- review ---------------------------------- */

const profileFields: {
  key: keyof FieldRemarks;
  label: string;
  value: (p: AdminProviderDetail) => string;
}[] = [
  { key: "type", label: "providerType", value: (p) => p.type },
  { key: "name", label: "unitName", value: (p) => p.name },
  { key: "contactPerson", label: "contactPerson", value: (p) => p.contactPerson },
  { key: "mobile", label: "mobile", value: (p) => p.mobile },
  { key: "email", label: "email", value: (p) => p.email ?? "—" },
  { key: "addressLine", label: "addressLine", value: (p) => p.addressLine },
  { key: "pincode", label: "pincode", value: (p) => p.pincode ?? "—" },
  { key: "registrationNo", label: "registrationNo", value: (p) => p.registrationNo ?? "—" },
  { key: "gstin", label: "gstin", value: (p) => p.gstin ?? "—" },
  {
    key: "baseLocation",
    label: "baseLocation",
    value: (p) => `${p.baseLatitude}, ${p.baseLongitude}`,
  },
];
const reviewTone = (s: string) =>
  s === "ACCEPTED" ? "success" : s === "RETURNED" ? "warning" : "neutral";

function DocumentReviewRow({
  providerId,
  row,
  canReview,
}: {
  providerId: string;
  row: ProviderDocumentRow;
  canReview: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const doc = row.document;
  const review = useMutation({
    mutationFn: (v: { decision: "ACCEPT" | "RETURN"; remarks?: string }) =>
      adminProvidersApi.reviewDocument(providerId, doc!.id, v.decision, v.remarks),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-provider", providerId] }),
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const name = (i18n.language === "te" && row.nameTe) || row.nameEn;
  return (
    <tr>
      <td>{name}</td>
      <td>{row.equipmentLabel ?? "—"}</td>
      <td>
        {doc ? (
          <Button
            size="small"
            variant="outline"
            onClick={() => void openFile(doc.file.url).catch(() => toast.error(t("error")))}
          >
            {t("view")}
          </Button>
        ) : (
          <StatusBadge tone="warning">{t("notUploaded")}</StatusBadge>
        )}
      </td>
      <td>
        {doc && (
          <StatusBadge tone={reviewTone(doc.status)}>{t("review_" + doc.status)}</StatusBadge>
        )}
        {doc?.status === "RETURNED" && <RemarkNotice text={doc.remarks} />}
      </td>
      <td>
        {doc && canReview && (
          <div className="inline-actions">
            <Button
              size="small"
              disabled={review.isPending || doc.status === "ACCEPTED"}
              onClick={() => review.mutate({ decision: "ACCEPT" })}
            >
              {t("accept")}
            </Button>
            <RemarksDialog
              trigger={
                <Button size="small" variant="outline" disabled={review.isPending}>
                  {t("returnItem")}
                </Button>
              }
              title={t("returnDocument")}
              description={t("returnItemBody")}
              action={t("returnItem")}
              label={t("remarks")}
              maxLength={500}
              onConfirm={(remarks) => review.mutate({ decision: "RETURN", remarks })}
            />
          </div>
        )}
      </td>
    </tr>
  );
}

function EquipmentReview({
  e,
  remark,
  onRemark,
  canRemark,
}: {
  e: ReviewEquipment;
  remark: string;
  onRemark: (v: string) => void;
  canRemark: boolean;
}) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  return (
    <li className="document-item">
      <div className="document-head">
        <strong>
          {e.make} {e.model} ({e.year})
        </strong>
        <span className="muted">{name(e.category)}</span>
        <StatusBadge tone={e.status === "ACTIVE" ? "success" : "neutral"}>
          {t("equip_" + e.status)}
        </StatusBadge>
      </div>
      <p className="muted">
        {t("units")}:{" "}
        {e.units
          .map((u) => u.unitLabel + (u.registrationNo ? ` (${u.registrationNo})` : ""))
          .join(", ")}
        {e.photos.length > 0 && ` · ${t("equipmentPhotos")}: ${e.photos.length}`}
      </p>
      {e.photos.length > 0 && (
        <div className="inline-actions">
          {e.photos.map((p, i) => (
            <Button
              key={p.id}
              size="small"
              variant="ghost"
              onClick={() => void openFile(p.url).catch(() => toast.error(t("error")))}
            >
              {t("photo")} {i + 1}
            </Button>
          ))}
        </div>
      )}
      <ul className="plain-list">
        {e.services.map((s) => (
          <li key={s.id}>
            {name(s.operation)}: ₹{paiseToRupees(s.ratePaise)} / {t("basis_" + s.pricingBasis)}
            {s.minChargePaise
              ? ` · ${t("minChargeRupees")} ₹${paiseToRupees(s.minChargePaise)}`
              : ""}
          </li>
        ))}
      </ul>
      {canRemark && (
        <div className="form-field">
          <label htmlFor={"eqr-" + e.id}>{t("remarkForItem")}</label>
          <Input
            id={"eqr-" + e.id}
            value={remark}
            maxLength={500}
            onChange={(event) => onRemark(event.target.value)}
          />
        </div>
      )}
    </li>
  );
}

export function AdminProviderReviewPage() {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const { providerId = "" } = useParams();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const canVerify = user.permissions.includes(permissions.providerVerify);
  const canSuspend = user.permissions.includes(permissions.providerSuspend);
  const [fieldRemarks, setFieldRemarks] = useState<Record<string, string>>({});
  const [equipmentRemarks, setEquipmentRemarks] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-provider", providerId],
    queryFn: ({ signal }) => adminProvidersApi.get(providerId, signal),
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-provider", providerId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
  };
  const fail = (error: unknown) => toast.error(t(errorKey(error)));
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      refresh();
      toast.success(t("changesSaved"));
    },
    onError: fail,
  });
  const reviewBank = useMutation({
    mutationFn: (v: { decision: "ACCEPT" | "RETURN"; remarks?: string }) =>
      adminProvidersApi.reviewBank(providerId, v.decision, v.remarks),
    onSuccess: refresh,
    onError: fail,
  });
  const reveal = useMutation({
    mutationFn: () => adminProvidersApi.revealBank(providerId),
    onSuccess: (bank) => {
      setRevealed(bank.accountNumber);
      void queryClient.invalidateQueries({ queryKey: ["admin-provider", providerId] });
    },
    onError: fail,
  });
  if (query.isPending) return <FullPageLoader />;
  if (query.isError)
    return <ErrorState title={t(errorKey(query.error) === "notFound" ? "notFound" : "error")} />;
  const p = query.data;
  const submitted = p.status === "SUBMITTED";
  const reviewing = submitted && canVerify;
  const requiredDocs = p.documents.filter((d) => d.required);
  const pendingDocs = p.documents.filter((d) => d.document && d.document.status === "PENDING");
  const allAccepted =
    requiredDocs.every((d) => d.document?.status === "ACCEPTED") &&
    p.bankAccount?.status === "ACCEPTED";
  const clean = (r: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(r)
        .filter(([, v]) => v.trim().length >= 3)
        .map(([k, v]) => [k, v.trim()]),
    );
  const buildFieldRemarks = (): FieldRemarks => {
    const equipment = clean(equipmentRemarks);
    return {
      ...clean(fieldRemarks),
      ...(Object.keys(equipment).length ? { equipment } : {}),
    } as FieldRemarks;
  };
  const acceptAll = () =>
    run.mutate(async () => {
      for (const d of pendingDocs)
        await adminProvidersApi.reviewDocument(providerId, d.document!.id, "ACCEPT");
      if (p.bankAccount?.status === "PENDING")
        await adminProvidersApi.reviewBank(providerId, "ACCEPT");
    });
  const hasPending = pendingDocs.length > 0 || p.bankAccount?.status === "PENDING";
  return (
    <div className="dashboard-content review-page">
      <PageHeader
        title={p.name}
        description={`${p.providerNo} · ${name(p.village)}, ${name(p.mandal)}, ${name(p.district)}`}
      >
        <ProviderStatusBadge status={p.status} />
        <Button variant="outline" asChild>
          <Link to="/admin/providers">{t("back")}</Link>
        </Button>
      </PageHeader>

      <section className="panel dashboard-section">
        <h2>{t("providerProfile")}</h2>
        <dl className="account-facts">
          {profileFields.map((f) => (
            <div key={f.key}>
              <dt>{t(f.label)}</dt>
              <dd>
                {f.key === "type" ? t("type_" + p.type) : f.value(p)}
                {reviewing && (
                  <Input
                    aria-label={t("remarkFor", { field: t(f.label) })}
                    placeholder={t("remarkForItem")}
                    value={fieldRemarks[f.key] ?? ""}
                    maxLength={500}
                    onChange={(e) => setFieldRemarks({ ...fieldRemarks, [f.key]: e.target.value })}
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel dashboard-section">
        <div className="section-heading">
          <h2>{t("providerDocuments")}</h2>
          {reviewing && hasPending && (
            <Button variant="outline" disabled={run.isPending} onClick={acceptAll}>
              {t("acceptAllPending")}
            </Button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("document")}</th>
                <th scope="col">{t("equipmentName")}</th>
                <th scope="col">{t("file")}</th>
                <th scope="col">{t("status")}</th>
                <th scope="col">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {p.documents.map((row) => (
                <DocumentReviewRow
                  key={row.documentTypeCode + (row.equipmentId ?? "")}
                  providerId={providerId}
                  row={row}
                  // equipment documents stay reviewable after approval, provider documents only while submitted
                  canReview={
                    canVerify &&
                    (submitted ||
                      (row.scope === "EQUIPMENT" &&
                        (p.status === "APPROVED" || p.status === "SUSPENDED")))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel dashboard-section">
        <h2>{t("bankAccount")}</h2>
        {p.bankAccount ? (
          <>
            <dl className="account-facts">
              <div>
                <dt>{t("accountHolder")}</dt>
                <dd>{p.bankAccount.holderName}</dd>
              </div>
              <div>
                <dt>{t("accountNumber")}</dt>
                <dd>{revealed ?? p.bankAccount.accountNumber}</dd>
              </div>
              <div>
                <dt>{t("ifsc")}</dt>
                <dd>
                  {p.bankAccount.ifsc}
                  {p.bankAccount.bankName
                    ? ` · ${p.bankAccount.bankName}, ${p.bankAccount.branchName ?? ""}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>{t("status")}</dt>
                <dd>
                  <StatusBadge tone={reviewTone(p.bankAccount.status)}>
                    {t("review_" + p.bankAccount.status)}
                  </StatusBadge>
                  {p.bankAccount.status === "RETURNED" && (
                    <RemarkNotice text={p.bankAccount.remarks} />
                  )}
                </dd>
              </div>
            </dl>
            {canVerify && (
              <div className="inline-actions">
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="small"
                      disabled={reveal.isPending || revealed !== null}
                    >
                      {t("revealAccount")}
                    </Button>
                  }
                  title={t("confirmReveal")}
                  description={t("confirmRevealBody")}
                  action={t("revealAccount")}
                  onConfirm={() => reveal.mutate()}
                />
                {submitted && (
                  <>
                    <Button
                      size="small"
                      disabled={reviewBank.isPending || p.bankAccount.status === "ACCEPTED"}
                      onClick={() => reviewBank.mutate({ decision: "ACCEPT" })}
                    >
                      {t("accept")}
                    </Button>
                    <RemarksDialog
                      trigger={
                        <Button size="small" variant="outline" disabled={reviewBank.isPending}>
                          {t("returnItem")}
                        </Button>
                      }
                      title={t("returnBank")}
                      description={t("returnItemBody")}
                      action={t("returnItem")}
                      label={t("remarks")}
                      maxLength={500}
                      onConfirm={(remarks) => reviewBank.mutate({ decision: "RETURN", remarks })}
                    />
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState title={t("noBank")} />
        )}
      </section>

      <section className="panel dashboard-section">
        <h2>{t("myEquipment")}</h2>
        {p.equipment.length ? (
          <ul className="document-list">
            {p.equipment.map((e) => (
              <EquipmentReview
                key={e.id}
                e={e}
                canRemark={reviewing}
                remark={equipmentRemarks[e.id] ?? ""}
                onRemark={(v) => setEquipmentRemarks({ ...equipmentRemarks, [e.id]: v })}
              />
            ))}
          </ul>
        ) : (
          <EmptyState title={t("noEquipment")} />
        )}
      </section>

      <section className="panel dashboard-section">
        <h2>{t("coverageAndHours")}</h2>
        <p>
          {p.coverage.mode === "RADIUS"
            ? t("coverageRadiusSummary", { km: p.coverage.radiusKm })
            : p.coverage.mode === "AREAS"
              ? p.coverage.areas
                  .map((a) =>
                    a.village ? `${name(a.village)}, ${name(a.village.mandal)}` : name(a.mandal!),
                  )
                  .join("; ")
              : "—"}
        </p>
        <p className="muted">
          {p.workingHours
            .map((h) => `${t("weekday_" + h.weekday)} ${h.start}–${h.end}`)
            .join(" · ") || "—"}
        </p>
        {reviewing && (
          <>
            <Input
              aria-label={t("remarkFor", { field: t("serviceCoverage") })}
              placeholder={t("remarkForCoverage")}
              value={fieldRemarks.coverage ?? ""}
              maxLength={500}
              onChange={(e) => setFieldRemarks({ ...fieldRemarks, coverage: e.target.value })}
            />
            <Input
              aria-label={t("remarkFor", { field: t("workingHours") })}
              placeholder={t("remarkForHours")}
              value={fieldRemarks.workingHours ?? ""}
              maxLength={500}
              onChange={(e) => setFieldRemarks({ ...fieldRemarks, workingHours: e.target.value })}
            />
          </>
        )}
        <h3>{t("operators")}</h3>
        {p.operators.length ? (
          <ul className="plain-list">
            {p.operators.map((o) => (
              <li key={o.id}>
                {o.fullName} {o.licenceNo ? `· ${o.licenceNo}` : ""} · {t("equip_" + o.status)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("noOperators")}</p>
        )}
      </section>

      <section className="panel dashboard-section">
        <h2>{t("verificationHistory")}</h2>
        <VerificationTimeline items={p.history} />
      </section>

      {(reviewing || (canSuspend && ["APPROVED", "SUSPENDED"].includes(p.status))) && (
        <div className="action-bar" role="region" aria-label={t("verificationActions")}>
          {reviewing && (
            <>
              <Button
                disabled={!allAccepted || run.isPending}
                title={allAccepted ? undefined : t("approveDisabledWhy")}
                onClick={() =>
                  run.mutate(() => adminProvidersApi.verify(providerId, { action: "APPROVE" }))
                }
              >
                {t("approve")}
              </Button>
              <RemarksDialog
                trigger={
                  <Button variant="outline" disabled={run.isPending}>
                    {t("returnApplication")}
                  </Button>
                }
                title={t("returnApplication")}
                description={t("returnApplicationBody")}
                action={t("returnApplication")}
                label={t("generalRemarks")}
                required={
                  Object.keys(buildFieldRemarks()).length === 0 &&
                  !p.documents.some((d) => d.document?.status === "RETURNED") &&
                  p.bankAccount?.status !== "RETURNED"
                }
                onConfirm={(remarks) =>
                  run.mutate(() => {
                    const fr = buildFieldRemarks();
                    return adminProvidersApi.verify(providerId, {
                      action: "RETURN",
                      ...(remarks ? { remarks } : {}),
                      ...(Object.keys(fr).length ? { fieldRemarks: fr } : {}),
                    });
                  })
                }
              />
              <RemarksDialog
                trigger={
                  <Button variant="outline" disabled={run.isPending}>
                    {t("reject")}
                  </Button>
                }
                title={t("rejectApplication")}
                description={t("rejectBody")}
                action={t("reject")}
                label={t("remarks")}
                onConfirm={(remarks) =>
                  run.mutate(() =>
                    adminProvidersApi.verify(providerId, { action: "REJECT", remarks }),
                  )
                }
              />
            </>
          )}
          {canSuspend && p.status === "APPROVED" && (
            <RemarksDialog
              trigger={<Button variant="outline">{t("suspend")}</Button>}
              title={t("suspend")}
              action={t("suspend")}
              label={t("remarks")}
              onConfirm={(remarks) =>
                run.mutate(() => adminProvidersApi.suspend(providerId, remarks))
              }
            />
          )}
          {canSuspend && p.status === "SUSPENDED" && (
            <RemarksDialog
              trigger={<Button>{t("reinstate")}</Button>}
              title={t("reinstate")}
              action={t("reinstate")}
              label={t("remarksOptional")}
              required={false}
              onConfirm={(remarks) =>
                run.mutate(() => adminProvidersApi.reinstate(providerId, remarks || undefined))
              }
            />
          )}
          {canSuspend && (p.status === "APPROVED" || p.status === "SUSPENDED") && (
            <RemarksDialog
              trigger={<Button variant="outline">{t("blacklist")}</Button>}
              title={t("blacklist")}
              description={t("blacklistBody")}
              action={t("blacklist")}
              label={t("remarks")}
              onConfirm={(remarks) =>
                run.mutate(() => adminProvidersApi.blacklist(providerId, remarks))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
