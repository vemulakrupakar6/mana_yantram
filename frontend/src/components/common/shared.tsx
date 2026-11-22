import { Component, type ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/config/i18n";
import { Button } from "@/components/ui/button";

export function LoadingSpinner({ size = 19 }: { size?: number }) {
  return <LoaderCircle aria-hidden="true" size={size} className="spinner" />;
}
export function FullPageLoader() {
  const { t } = useTranslation();
  return (
    <div className="full-loader" role="status">
      <LoadingSpinner size={27} />
      {t("loading")}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}
export function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Inbox size={22} />
      </span>
      <strong>{title}</strong>
    </div>
  );
}
export function ErrorState({ title, retry }: { title: string; retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state" role="alert">
      <AlertCircle size={27} />
      <strong>{title}</strong>
      {retry && (
        <Button variant="outline" onClick={retry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  return <span className={"status-badge status-" + tone}>{children}</span>;
}
export function UserAvatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {Array.from(name.trim()).slice(0, 2).join("").toLocaleUpperCase()}
    </span>
  );
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <main className="full-loader">
        <ErrorState title={i18n.t("error")} retry={() => window.location.reload()} />
      </main>
    ) : (
      this.props.children
    );
  }
}
