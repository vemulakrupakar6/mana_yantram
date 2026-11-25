import { useTranslation } from "react-i18next";
import { roleLabels } from "@/types/auth";
import type { HistoryItem } from "@/types/verification";
import { ProviderStatusBadge, RemarkNotice } from "./ProviderParts";

/** Newest first. The actor is a role name, never a username. */
export function VerificationTimeline({ items }: { items: HistoryItem[] }) {
  const { t, i18n } = useTranslation();
  const format = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === "te" ? "te-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  if (!items.length) return <p className="muted">{t("noHistory")}</p>;
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id}>
          <div className="timeline-head">
            <strong>{t("action_" + item.action)}</strong>
            <ProviderStatusBadge status={item.toStatus} />
            <span className="muted">
              {item.actorRole ? t(roleLabels[item.actorRole]) : "—"} ·{" "}
              <time dateTime={item.createdAt}>{format(item.createdAt)}</time>
            </span>
          </div>
          <RemarkNotice text={item.remarks} />
          {item.fieldRemarks &&
            Object.entries(item.fieldRemarks)
              .filter(([key]) => key !== "equipment")
              .map(([key, text]) => (
                <RemarkNotice key={key} text={`${t("field_" + key)}: ${text as string}`} />
              ))}
        </li>
      ))}
    </ol>
  );
}
