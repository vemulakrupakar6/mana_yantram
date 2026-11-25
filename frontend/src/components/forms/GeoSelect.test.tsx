import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { setLanguage } from "@/config/i18n";
import { emptyGeo, GeoSelect, type GeoValue } from "./GeoSelect";

vi.mock("@/api/masters.api", () => ({
  mastersApi: {
    districts: async () => [
      { id: "d1", lgdCode: "1", nameEn: "District One", nameTe: "జిల్లా ఒకటి" },
      { id: "d2", lgdCode: "2", nameEn: "District Two", nameTe: "జిల్లా రెండు" },
    ],
    mandals: async (id: string) => [
      { id: id + "-m1", lgdCode: "m", nameEn: "Mandal of " + id, nameTe: "మండలం " + id },
    ],
    villages: async (id: string) => [
      { id: id + "-v1", lgdCode: "v", nameEn: "Village of " + id, nameTe: "గ్రామం " + id },
    ],
  },
}));
beforeEach(async () => {
  await setLanguage("en");
});
function Harness({ onValue }: { onValue: (value: GeoValue) => void }) {
  const [value, setValue] = useState<GeoValue>(emptyGeo);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <GeoSelect
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
    </QueryClientProvider>
  );
}
test("children stay disabled until the parent is chosen, and changing a parent clears them", async () => {
  const user = userEvent.setup();
  const seen = vi.fn();
  render(<Harness onValue={seen} />);
  expect(screen.getByLabelText("Mandal")).toBeDisabled();
  expect(screen.getByLabelText("Village")).toBeDisabled();
  await screen.findByRole("option", { name: "District One" });
  await user.selectOptions(screen.getByLabelText("District"), "d1");
  await waitFor(() => expect(screen.getByLabelText("Mandal")).toBeEnabled());
  await screen.findByRole("option", { name: "Mandal of d1" });
  await user.selectOptions(screen.getByLabelText("Mandal"), "d1-m1");
  await screen.findByRole("option", { name: "Village of d1-m1" });
  await user.selectOptions(screen.getByLabelText("Village"), "d1-m1-v1");
  expect(seen).toHaveBeenLastCalledWith({
    districtId: "d1",
    mandalId: "d1-m1",
    villageId: "d1-m1-v1",
  });
  await user.selectOptions(screen.getByLabelText("District"), "d2");
  expect(seen).toHaveBeenLastCalledWith({ districtId: "d2", mandalId: "", villageId: "" });
  expect(screen.getByLabelText("Village")).toBeDisabled();
});
test("shows Telugu names when the language is Telugu", async () => {
  await setLanguage("te");
  render(<Harness onValue={() => {}} />);
  expect(await screen.findByRole("option", { name: "జిల్లా ఒకటి" })).toBeInTheDocument();
});
