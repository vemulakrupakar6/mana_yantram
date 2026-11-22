import { Link } from "react-router-dom";
import { MapPinOff, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function RouteErrorPage({ code, dashboard }: { code: 403 | 404; dashboard?: string }) {
  const { t } = useTranslation();
  const Icon = code === 403 ? ShieldOff : MapPinOff;
  return (
    <section className="not-found site-wrap">
      <span className="icon-tile">
        <Icon size={27} />
      </span>
      <p className="eyebrow">{code}</p>
      <h1>{t(code === 403 ? "denied" : "notFound")}</h1>
      <Button asChild>
        <Link to={dashboard || "/"}>{t(dashboard ? "backDashboard" : "backHome")}</Link>
      </Button>
    </section>
  );
}
