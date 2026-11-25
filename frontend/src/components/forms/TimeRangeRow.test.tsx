import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { setLanguage } from "@/config/i18n";
import { checkBlock } from "@/pages/provider/AvailabilityPage";
import { emptyGeo, GeoSelect, type GeoNames, type GeoValue } from "./GeoSelect";
import { defaultWeek, rowInvalid, TimeRangeRow, type DayRow } from "./TimeRangeRow";

vi.mock("@/api/masters.api", () => ({
  mastersApi: {
    districts: async () => [{ id: "d1", lgdCode: "1", nameEn: "District One", nameTe: "జిల్లా" }],
    mandals: async () => [{ id: "m1", lgdCode: "1", nameEn: "Mandal One", nameTe: "మండలం" }],
    villages: async () => [{ id: "v1", lgdCode: "1", nameEn: "Village One", nameTe: "గ్రామం" }],
  },
}));
beforeEach(async () => {
  await setLanguage("en");
});

test("the default week has seven disabled days from Monday", () => {
  const week = defaultWeek();
  expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(week.every((d) => !d.enabled)).toBe(true);
});
test("a day is invalid only when enabled with a start that is not before the end", () => {
  const row: DayRow = { weekday: 1, enabled: true, start: "06:00", end: "18:00" };
  expect(rowInvalid(row)).toBe(false);
  expect(rowInvalid({ ...row, end: "24:00" })).toBe(false);
  expect(rowInvalid({ ...row, start: "18:00", end: "06:00" })).toBe(true);
  expect(rowInvalid({ ...row, start: "06:00", end: "06:00" })).toBe(true);
  expect(rowInvalid({ ...row, end: "" })).toBe(true);
  expect(rowInvalid({ ...row, enabled: false, start: "18:00", end: "06:00" })).toBe(false);
});
function Harness() {
  const [row, setRow] = useState<DayRow>({
    weekday: 2,
    enabled: false,
    start: "06:00",
    end: "18:00",
  });
  return <TimeRangeRow row={row} onChange={setRow} />;
}
test("times are disabled until the day is ticked, and a bad range shows a message", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByLabelText("Tuesday start time")).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Tuesday" }));
  expect(screen.getByLabelText("Tuesday start time")).toBeEnabled();
  expect(screen.queryByRole("alert")).toBeNull();
  await user.clear(screen.getByLabelText("Tuesday end time"));
  await user.type(screen.getByLabelText("Tuesday end time"), "05:00");
  expect(await screen.findByText("The end time must be after the start time.")).toBeVisible();
});

test("block rules mirror the server: order, future end, 180-day limit", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
  expect(checkBlock(iso(1), iso(3), now)).toBe("ok");
  expect(checkBlock(iso(3), iso(1), now)).toBe("order");
  expect(checkBlock(iso(1), iso(1), now)).toBe("order");
  expect(checkBlock("", iso(1), now)).toBe("order");
  expect(checkBlock(iso(-5), iso(-1), now)).toBe("past");
  expect(checkBlock(iso(-1), iso(2), now)).toBe("ok"); // may already be in progress
  expect(checkBlock(iso(1), iso(182), now)).toBe("long");
  expect(checkBlock(iso(1), iso(181), now)).toBe("ok");
});

test("GeoSelect reports the display names of the selection", async () => {
  const seen: GeoNames[] = [];
  function Geo() {
    const [value, setValue] = useState<GeoValue>(emptyGeo);
    return (
      <QueryClientProvider client={new QueryClient()}>
        <GeoSelect
          value={value}
          onChange={(next, names) => {
            setValue(next);
            seen.push(names);
          }}
        />
      </QueryClientProvider>
    );
  }
  const user = userEvent.setup();
  render(<Geo />);
  await screen.findByRole("option", { name: "District One" });
  await user.selectOptions(screen.getByLabelText("District"), "d1");
  await screen.findByRole("option", { name: "Mandal One" });
  await user.selectOptions(screen.getByLabelText("Mandal"), "m1");
  await screen.findByRole("option", { name: "Village One" });
  await user.selectOptions(screen.getByLabelText("Village"), "v1");
  expect(seen.at(-1)).toEqual({
    district: "District One",
    mandal: "Mandal One",
    village: "Village One",
  });
  expect(seen[0]).toEqual({ district: "District One", mandal: "", village: "" });
});
