import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { equipmentApi } from "@/api/equipment.api";
import { rateCapsApi } from "@/api/rate-caps.api";
import { setLanguage } from "@/config/i18n";
import {
  equipmentDetailsSchema,
  equipmentWizardSchema,
  parseImplements,
  serviceFormSchema,
} from "@/schemas/equipment";
import type { Category } from "@/types/equipment";
import { emptyDetails, toEquipmentPayload } from "./EquipmentFields";
import { ServiceForm, toServicePayload } from "./ServiceForm";

vi.mock("@/api/equipment.api", () => ({
  equipmentApi: { addService: vi.fn(), updateService: vi.fn() },
}));
vi.mock("@/api/rate-caps.api", () => ({ rateCapsApi: { hint: vi.fn() } }));
beforeEach(async () => {
  await setLanguage("en");
  vi.mocked(equipmentApi.addService).mockReset();
  vi.mocked(rateCapsApi.hint).mockReset();
  vi.mocked(rateCapsApi.hint).mockResolvedValue({
    enabled: false,
    maxRatePaise: null,
    scope: null,
  });
});

const category: Category = {
  id: "c1",
  code: "TRACTOR",
  nameEn: "Tractor",
  nameTe: "ట్రాక్టర్",
  requiresPilotLicence: false,
  requiredDocumentTypes: [],
  operations: [
    {
      id: "o1",
      code: "PLOUGHING",
      nameEn: "Ploughing",
      nameTe: "దుక్కి",
      defaultPricingBasis: "ACRE",
    },
    { id: "o2", code: "HAULAGE", nameEn: "Haulage", nameTe: "రవాణా", defaultPricingBasis: "HOUR" },
  ],
};
const renderForm = (usedOperationIds: string[] = []) => {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServiceForm
        equipmentId="e1"
        category={category}
        usedOperationIds={usedOperationIds}
        onDone={onDone}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onDone;
};

test("service payload keeps only the fields of the chosen travel mode", () => {
  const base = {
    operationId: "o1",
    pricingBasis: "ACRE" as const,
    ratePaise: 80000,
    minChargePaise: null,
    travelFlatPaise: 2000,
    travelPerKmPaise: 1500,
    freeRadiusKm: "5",
    workRateAcresPerHour: "1.5",
  };
  const none = toServicePayload({ ...base, travelMode: "NONE" });
  expect(none).toEqual({
    operationId: "o1",
    pricingBasis: "ACRE",
    ratePaise: 80000,
    minChargePaise: 0,
    travelMode: "NONE",
    workRateAcresPerHour: 1.5,
  });
  expect(toServicePayload({ ...base, travelMode: "FLAT" })).toMatchObject({
    travelFlatPaise: 2000,
  });
  expect(toServicePayload({ ...base, travelMode: "FLAT" })).not.toHaveProperty("travelPerKmPaise");
  expect(toServicePayload({ ...base, travelMode: "PER_KM" })).toMatchObject({
    travelPerKmPaise: 1500,
    freeRadiusKm: 5,
  });
  expect(toServicePayload({ ...base, travelMode: "PER_KM" })).not.toHaveProperty("travelFlatPaise");
});
test("service schema mirrors the server rules", () => {
  const ok = {
    operationId: "o1",
    pricingBasis: "ACRE" as const,
    ratePaise: 100,
    minChargePaise: 0,
    travelMode: "NONE" as const,
    travelFlatPaise: null,
    travelPerKmPaise: null,
    freeRadiusKm: "",
    workRateAcresPerHour: "0.1",
  };
  expect(serviceFormSchema.safeParse(ok).success).toBe(true);
  for (const bad of [
    { ratePaise: 99 },
    { ratePaise: null },
    { operationId: "" },
    { workRateAcresPerHour: "51" },
    { workRateAcresPerHour: "0.05" },
    { travelMode: "FLAT" as const },
    { travelMode: "PER_KM" as const, travelPerKmPaise: 0 },
  ])
    expect(serviceFormSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  expect(
    serviceFormSchema.safeParse({ ...ok, travelMode: "FLAT", travelFlatPaise: 0 }).success,
  ).toBe(true);
});
test("equipment schema checks year, capacity pairing and implements count", () => {
  const ok = { ...emptyDetails, categoryId: "c", make: "Mahindra", model: "575", year: "2021" };
  expect(equipmentDetailsSchema.safeParse(ok).success).toBe(true);
  for (const bad of [
    { year: "1979" },
    { year: String(new Date().getFullYear() + 2) },
    { capacityValue: "50" },
    { capacityUnit: "HP" as const },
    { capacityValue: "-1", capacityUnit: "HP" as const },
    { implementsText: Array.from({ length: 11 }, (_, i) => "i" + i).join(",") },
  ])
    expect(equipmentDetailsSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  expect(equipmentWizardSchema.safeParse({ ...ok, numberOfUnits: "51" }).success).toBe(false);
  expect(equipmentWizardSchema.safeParse({ ...ok, numberOfUnits: "3" }).success).toBe(true);
});
test("equipment payload parses implements and sends null capacity only when editing", () => {
  expect(parseImplements(" Plough, Harrow ,,\nSeeder ")).toEqual(["Plough", "Harrow", "Seeder"]);
  const v = {
    ...emptyDetails,
    categoryId: "c",
    make: " M ",
    model: "X",
    year: "2020",
    implementsText: "A, B",
  };
  expect(toEquipmentPayload(v, false)).toEqual({
    categoryId: "c",
    make: "M",
    model: "X",
    year: 2020,
    implements: ["A", "B"],
  });
  expect(toEquipmentPayload(v, true)).toMatchObject({ capacityValue: null, capacityUnit: null });
  expect(toEquipmentPayload({ ...v, capacityValue: "50", capacityUnit: "HP" }, true)).toMatchObject(
    { capacityValue: 50, capacityUnit: "HP" },
  );
});

test("travel fields appear only for the chosen mode and defaults follow the operation", async () => {
  const user = userEvent.setup();
  renderForm();
  expect(screen.queryByLabelText("Flat travel charge (₹)")).toBeNull();
  await user.selectOptions(screen.getByLabelText("Operation"), "o2");
  expect(screen.getByLabelText("Charged per")).toHaveValue("HOUR");
  await user.selectOptions(screen.getByLabelText("Travel charge"), "FLAT");
  expect(screen.getByLabelText("Flat travel charge (₹)")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Travel charge"), "PER_KM");
  expect(screen.queryByLabelText("Flat travel charge (₹)")).toBeNull();
  expect(screen.getByLabelText("Charge per km (₹)")).toBeInTheDocument();
  expect(screen.getByLabelText("Free travel radius (km)")).toBeInTheDocument();
});
test("operations already on the rate card are not offered again", () => {
  renderForm(["o1"]);
  expect(screen.queryByRole("option", { name: "Ploughing" })).toBeNull();
  expect(screen.getByRole("option", { name: "Haulage" })).toBeInTheDocument();
});
test("submitting converts rupees to paise and calls the API once valid", async () => {
  vi.mocked(equipmentApi.addService).mockResolvedValue({} as never);
  const user = userEvent.setup();
  const onDone = renderForm();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect((await screen.findAllByText(/required|at least/i)).length).toBeGreaterThan(0);
  expect(equipmentApi.addService).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Operation"), "o1");
  await user.type(screen.getByLabelText("Rate (₹)"), "800.50");
  await user.type(screen.getByLabelText("Work rate (acres per hour)"), "1.5");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(equipmentApi.addService).toHaveBeenCalledWith("e1", {
    operationId: "o1",
    pricingBasis: "ACRE",
    ratePaise: 80050,
    minChargePaise: 0,
    travelMode: "NONE",
    workRateAcresPerHour: 1.5,
  });
});

test("shows the applicable cap next to the rate, only when caps are on and one exists", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.selectOptions(screen.getByLabelText("Operation"), "o1");
  await waitFor(() =>
    expect(rateCapsApi.hint).toHaveBeenCalledWith({
      categoryId: "c1",
      operationId: "o1",
      pricingBasis: "ACRE",
    }),
  );
  expect(screen.queryByText(/Maximum allowed/)).toBeNull(); // enforcement off: no hint

  vi.mocked(rateCapsApi.hint).mockResolvedValue({
    enabled: true,
    maxRatePaise: 60000,
    scope: "DISTRICT",
  });
  await user.selectOptions(screen.getByLabelText("Operation"), "o2");
  expect(await screen.findByText("Maximum allowed in your district: ₹600.00")).toBeInTheDocument();

  vi.mocked(rateCapsApi.hint).mockResolvedValue({
    enabled: true,
    maxRatePaise: 90000,
    scope: "STATEWIDE",
  });
  await user.selectOptions(screen.getByLabelText("Charged per"), "DAY");
  expect(await screen.findByText("Maximum allowed statewide: ₹900.00")).toBeInTheDocument();
});
test("a server rate-cap rejection is shown on the rate field", async () => {
  const { AxiosError } = await import("axios");
  const message = "The rate is above the allowed maximum of ₹600.00.";
  vi.mocked(equipmentApi.addService).mockRejectedValue(
    new AxiosError("x", "422", undefined, undefined, {
      status: 422,
      data: {
        success: false,
        code: "RATE_ABOVE_CAP",
        message,
        errors: [{ field: "ratePaise", message }],
      },
    } as never),
  );
  const user = userEvent.setup();
  renderForm();
  await user.selectOptions(screen.getByLabelText("Operation"), "o1");
  await user.type(screen.getByLabelText("Rate (₹)"), "900");
  await user.type(screen.getByLabelText("Work rate (acres per hour)"), "1");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText(/above the allowed maximum/i)).toBeInTheDocument();
});
