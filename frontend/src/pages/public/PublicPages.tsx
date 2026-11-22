import { Link } from "react-router-dom";
import { ClipboardList, Sprout, Tractor, UserRoundPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceCards } from "@/components/common/service-cards";
import { PageHeader } from "@/components/common/shared";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <>
      <section className="hero">
        <div className="site-wrap hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">
              <Sprout size={18} aria-hidden="true" />
              {t("tagline")}
            </p>
            <h1>
              {t("hero1")} <span>{t("hero2")}</span>
            </h1>
            <p className="hero-description">{t("heroBody")}</p>
            <div className="hero-actions">
              <Button asChild>
                <Link to="/services">{t("browse")}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/register">{t("create")}</Link>
              </Button>
            </div>
            <Link className="provider-link" to="/register?role=PROVIDER">
              <Tractor size={19} aria-hidden="true" />
              {t("become")}
            </Link>
          </div>
          <div className="hero-photo">
            <img src="/images/tractor.jpg" alt="" fetchPriority="high" width="720" height="520" />
          </div>
        </div>
      </section>
      <section className="site-wrap land-section" aria-labelledby="categories">
        <div className="section-heading">
          <h2 id="categories">{t("categories")}</h2>
          <p className="muted">{t("categoryBody")}</p>
        </div>
        <ServiceCards />
      </section>
      <section className="how-section">
        <div className="site-wrap land-section">
          <h2>{t("how")}</h2>
          <div className="steps-grid">
            {[UserRoundPlus, Tractor, ClipboardList].map((Icon, index) => (
              <article key={index}>
                <span className="icon-tile">
                  <Icon size={23} />
                </span>
                <h3>{t("how" + (index + 1))}</h3>
                <p className="muted">{t("how" + (index + 1) + "Body")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
export function ServicesPage() {
  const { t } = useTranslation();
  return (
    <section className="site-wrap inner-page">
      <PageHeader title={t("services")} description={t("categoryBody")} />
      <ServiceCards />
    </section>
  );
}
export function InfoPage({ kind }: { kind: "about" | "help" | "terms" | "privacy" }) {
  const { t } = useTranslation();
  const policy = kind === "terms" || kind === "privacy";
  return (
    <section className="site-wrap inner-page">
      <PageHeader title={t(kind)} description={policy ? t("demoPolicy") : undefined} />
      <article className="panel reading-panel">
        <p>{t(kind + "Body")}</p>
        {kind === "help" && (
          <Button asChild>
            <Link to="/login">{t("login")}</Link>
          </Button>
        )}
      </article>
    </section>
  );
}
