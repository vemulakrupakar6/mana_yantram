import { useTranslation } from "react-i18next";
import { serviceCategories } from "@/constants/services";

export function ServiceCards() {
  const { t } = useTranslation();

  return (
    <div className="service-grid">
      {serviceCategories.map(([name, image]) => (
        <article className="service-card" key={name}>
          <img src={"/images/" + image + ".jpg"} alt="" loading="lazy" width="450" height="260" />
          <div>
            <h3>{t(name)}</h3>
            <p className="muted">{t(name + "Body")}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
