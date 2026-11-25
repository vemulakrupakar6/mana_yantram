import { CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/common/shared";
import type { ChecklistItem, ProviderStatus } from "@/types/provider";

const tones: Record<
  ProviderStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "orange"
> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  RETURNED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  SUSPENDED: "orange",
  BLACKLISTED: "danger",
};
export function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const { t } = useTranslation();
  return <StatusBadge tone={tones[status]}>{t("provider" + status)}</StatusBadge>;
}

/** An officer's remark on a field or document, shown inline while the application is RETURNED. */
export function RemarkNotice({ text }: { text?: string | null }) {
  const { t } = useTranslation();
  if (!text) return null;
  return (
    <p className="remark-notice" role="note">
      <strong>{t("officerRemark")}:</strong> {text}
    </p>
  );
}

/** Where each checklist item is fixed. Items without a route yet render as plain text. */
export const checklistLinks: Partial<Record<ChecklistItem["key"], string>> = {
  profile: "/provider/profile",
  bankAccount: "/provider/bank",
  documents: "/provider/documents",
  equipment: "/provider/equipment",
  coverage: "/provider/coverage",
  workingHours: "/provider/coverage",
};
export function Checklist({
  items,
  links = checklistLinks,
}: {
  items: ChecklistItem[];
  links?: Partial<Record<ChecklistItem["key"], string>>;
}) {
  const { t } = useTranslation();
  return (
    <ul className="checklist">
      {items.map((item) => {
        const href = links[item.key];
        return (
          <li key={item.key} className={item.done ? "done" : "pending"}>
            {item.done ? (
              <CheckCircle2 size={20} aria-hidden="true" />
            ) : (
              <Circle size={20} aria-hidden="true" />
            )}
            <span>
              {href && !item.done ? (
                <Link className="text-link" to={href}>
                  {t("check_" + item.key)}
                </Link>
              ) : (
                t("check_" + item.key)
              )}
            </span>
            <span className="sr-only">{t(item.done ? "done" : "pending")}</span>
          </li>
        );
      })}
    </ul>
  );
}
