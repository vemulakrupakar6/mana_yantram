import { useState } from "react";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "./fields";

export interface LatLng {
  latitude: string;
  longitude: string;
}
const failures: Record<number, string> = {
  1: "geoDenied",
  2: "geoUnavailable",
  3: "geoTimeout",
};
/** Latitude/longitude inputs (India bounding box is enforced by the form schema) plus "use my location". */
export function LocationField({
  idPrefix,
  value,
  onChange,
  errors,
  disabled,
}: {
  idPrefix: string;
  value: LatLng;
  onChange: (value: LatLng) => void;
  errors?: Partial<Record<keyof LatLng, string>>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  function locate() {
    if (!("geolocation" in navigator)) return setProblem("geoUnavailable");
    setBusy(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        onChange({
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        });
      },
      (error) => {
        setBusy(false);
        setProblem(failures[error.code] ?? "geoUnavailable");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }
  const lat = Number(value.latitude);
  const lng = Number(value.longitude);
  const valid =
    value.latitude !== "" && value.longitude !== "" && Number.isFinite(lat) && Number.isFinite(lng);
  return (
    <fieldset className="form-stack">
      <legend>{t("location")}</legend>
      <div className="form-grid">
        <FormField
          id={idPrefix + "-lat"}
          label={t("latitude")}
          error={errors?.latitude ? t(errors.latitude) : undefined}
        >
          <Input
            id={idPrefix + "-lat"}
            inputMode="decimal"
            disabled={disabled}
            value={value.latitude}
            aria-invalid={Boolean(errors?.latitude)}
            onChange={(event) => onChange({ ...value, latitude: event.target.value })}
          />
        </FormField>
        <FormField
          id={idPrefix + "-lng"}
          label={t("longitude")}
          error={errors?.longitude ? t(errors.longitude) : undefined}
        >
          <Input
            id={idPrefix + "-lng"}
            inputMode="decimal"
            disabled={disabled}
            value={value.longitude}
            aria-invalid={Boolean(errors?.longitude)}
            onChange={(event) => onChange({ ...value, longitude: event.target.value })}
          />
        </FormField>
      </div>
      <div className="inline-actions">
        <Button
          type="button"
          variant="outline"
          size="small"
          disabled={disabled || busy}
          onClick={locate}
        >
          <MapPin size={16} />
          {t("useMyLocation")}
        </Button>
        {valid && (
          <a
            className="text-link"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
          >
            {t("viewOnMap")}
          </a>
        )}
      </div>
      {problem && (
        <p role="alert" className="field-error">
          {t(problem)}
        </p>
      )}
    </fieldset>
  );
}
