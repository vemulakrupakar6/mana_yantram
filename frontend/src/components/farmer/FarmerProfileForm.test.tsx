import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { farmersApi } from "@/api/farmers.api";
import { setLanguage } from "@/config/i18n";
import { plotFormSchema } from "@/schemas/farmer";
import { isValidAadhaar } from "@/utils/aadhaar";
import { emptyFarmerValues, toProfilePayload } from "./FarmerFields";
import { FarmerProfileForm } from "./FarmerProfileForm";

vi.mock("@/api/farmers.api", () => ({
  farmersApi: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/api/masters.api", () => ({
  mastersApi: {
    districts: async () => [{ id: "d1", lgdCode: "1", nameEn: "District One", nameTe: "జిల్లా" }],
    mandals: async () => [{ id: "m1", lgdCode: "1", nameEn: "Mandal One", nameTe: "మండలం" }],
    villages: async () => [{ id: "v1", lgdCode: "1", nameEn: "Village One", nameTe: "గ్రామం" }],
  },
}));
beforeEach(async () => {
  await setLanguage("en");
  vi.mocked(farmersApi.create).mockReset();
});

// 2345 6789 0124 is a Verhoeff-valid number starting with 2 (checksum computed offline).
const VALID = "234567890124";
test("client Aadhaar check accepts valid numbers with spaces and rejects bad ones", () => {
  expect(isValidAadhaar(VALID)).toBe(true);
  expect(isValidAadhaar("2345 6789 0124")).toBe(true);
  expect(isValidAadhaar("234567890125")).toBe(false);
  expect(isValidAadhaar("134567890124")).toBe(false);
  expect(isValidAadhaar("2345")).toBe(false);
});
test("profile payload omits a blank Aadhaar, strips spaces, and sends null when removed", () => {
  const base = { ...emptyFarmerValues, fullName: " Ravi ", mobile: "9876543210" };
  expect(toProfilePayload(base)).not.toHaveProperty("aadhaarNumber");
  expect(toProfilePayload({ ...base, aadhaarNumber: "2345 6789 0124" }).aadhaarNumber).toBe(VALID);
  expect(toProfilePayload({ ...base, removeAadhaar: true }).aadhaarNumber).toBeNull();
  expect(toProfilePayload(base).fullName).toBe("Ravi");
  expect(toProfilePayload(base).notifications).toEqual({ sms: true, inApp: true, push: true });
});
test("plot schema enforces extent, coordinates and year", () => {
  const ok = {
    surveyNo: "1",
    extentAcres: "2.5",
    districtId: "d",
    mandalId: "m",
    villageId: "v",
    latitude: "17.4",
    longitude: "78.5",
    crops: [{ cropId: "c", season: "RABI" as const, year: String(new Date().getFullYear()) }],
  };
  expect(plotFormSchema.safeParse(ok).success).toBe(true);
  for (const bad of [
    { extentAcres: "0" },
    { extentAcres: "1.234" },
    { extentAcres: "abc" },
    { latitude: "5" },
    { longitude: "99" },
    { crops: [{ ...ok.crops[0], year: "1999" }] },
  ])
    expect(plotFormSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
});

function renderForm(onSaved = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FarmerProfileForm onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}
test("shows validation errors and does not call the API for an empty form", async () => {
  renderForm();
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findAllByText("This field is required.")).length).toBeGreaterThan(0);
  expect(farmersApi.create).not.toHaveBeenCalled();
});
test("rejects a bad Aadhaar and mobile before submitting", async () => {
  renderForm();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Full name"), "Ravi Kumar");
  await user.type(screen.getByLabelText("Name of father or husband"), "Suresh Kumar");
  await user.type(screen.getByLabelText("Mobile number"), "12345");
  await user.type(screen.getByLabelText("Aadhaar number (optional)"), "234567890125");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Enter a 10-digit Indian mobile number.")).toBeVisible();
  expect(screen.getByText("Enter a valid 12-digit Aadhaar number.")).toBeVisible();
  expect(farmersApi.create).not.toHaveBeenCalled();
});
test("submits a complete profile and reports the saved farmer", async () => {
  const saved = { id: "f1" } as never;
  vi.mocked(farmersApi.create).mockResolvedValue(saved);
  const onSaved = renderForm();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Full name"), "Ravi Kumar");
  await user.type(screen.getByLabelText("Name of father or husband"), "Suresh Kumar");
  await user.type(screen.getByLabelText("Mobile number"), "9876543210");
  await screen.findByRole("option", { name: "District One" });
  await user.selectOptions(screen.getByLabelText("District"), "d1");
  await screen.findByRole("option", { name: "Mandal One" });
  await user.selectOptions(screen.getByLabelText("Mandal"), "m1");
  await screen.findByRole("option", { name: "Village One" });
  await user.selectOptions(screen.getByLabelText("Village"), "v1");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  const payload = vi.mocked(farmersApi.create).mock.calls[0][0];
  expect(payload).toMatchObject({
    fullName: "Ravi Kumar",
    mobile: "9876543210",
    districtId: "d1",
    mandalId: "m1",
    villageId: "v1",
    relationType: "FATHER",
  });
  expect(payload).not.toHaveProperty("aadhaarNumber");
});
