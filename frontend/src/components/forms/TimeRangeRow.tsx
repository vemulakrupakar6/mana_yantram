import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

export interface DayRow {
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
}
export const defaultWeek = (): DayRow[] =>
  Array.from({ length: 7 }, (_, i) => ({
    weekday: i + 1,
    enabled: false,
    start: "06:00",
    end: "18:00",
  }));
/** Rows that are switched on must have a start before the end ("24:00" is allowed as an end). */
export const rowInvalid = (row: DayRow) =>
  row.enabled && !(row.start && row.end && row.start < row.end);

/** One weekday: a checkbox plus start and end times. */
export function TimeRangeRow({
  row,
  onChange,
  disabled,
}: {
  row: DayRow;
  onChange: (row: DayRow) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const day = t("weekday_" + row.weekday);
  return (
    <div className="time-row">
      <label className="check-row">
        <input
          type="checkbox"
          checked={row.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ ...row, enabled: event.target.checked })}
        />
        {day}
      </label>
      <Input
        type="time"
        aria-label={t("startTimeFor", { day })}
        value={row.start}
        disabled={disabled || !row.enabled}
        onChange={(event) => onChange({ ...row, start: event.target.value })}
      />
      <span aria-hidden="true">–</span>
      <Input
        type="time"
        aria-label={t("endTimeFor", { day })}
        value={row.end}
        disabled={disabled || !row.enabled}
        onChange={(event) => onChange({ ...row, end: event.target.value })}
      />
      {rowInvalid(row) && (
        <span role="alert" className="field-error">
          {t("timeOrder")}
        </span>
      )}
    </div>
  );
}
