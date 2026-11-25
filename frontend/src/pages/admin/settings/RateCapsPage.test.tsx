import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { equipmentApi } from "@/api/equipment.api";
import { mastersApi } from "@/api/masters.api";
import { rateCapsApi, type RateCap } from "@/api/rate-caps.api";
import { setLanguage } from "@/config/i18n";
import { RateCapsPage } from "./RateCapsPage";

vi.mock("@/api/rate-caps.api", () => ({
  rateCapsApi: {
    enabled: vi.fn(),
    setEnabled: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@/api/equipment.api", () => ({ equipmentApi: { categories: vi.fn() } }));
vi.mock("@/api/masters.api", () => ({ mastersApi: { districts: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cap: RateCap = {
  id: "cap1",
  pricingBasis: "ACRE",
  maxRatePaise: 100000,
  isActive: true,
  category: { id: "c1", code: "TRACTOR", nameEn: "Tractor", nameTe: "ట్రాక్టర్" },
  operation: { id: "o1", code: "PLOUGHING", nameEn: "Ploughing", nameTe: "దుక్కి" },
  district: null,
};
beforeEach(async () => {
  await setLanguage("en");
  vi.resetAllMocks();
  vi.mocked(rateCapsApi.enabled).mockResolvedValue({ enabled: false });
  vi.mocked(rateCapsApi.list).mockResolvedValue({ items: [cap], page: 1, pageSize: 100, total: 1 });
  vi.mocked(equipmentApi.categories).mockResolvedValue([
    {
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
      ],
    },
  ]);
  vi.mocked(mastersApi.districts).mockResolvedValue([
    { id: "d1", lgdCode: "1", nameEn: "Adilabad", nameTe: "ఆదిలాబాద్" },
  ]);
});
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RateCapsPage />
    </QueryClientProvider>,
  );

test("lists caps and turns enforcement on only after confirmation", async () => {
  vi.mocked(rateCapsApi.setEnabled).mockResolvedValue({ enabled: true });
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByText("Enforcement is off")).toBeInTheDocument();
  expect(await screen.findByText("₹1000.00")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Statewide" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Turn enforcement on" }));
  expect(rateCapsApi.setEnabled).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Turn enforcement on" }));
  await waitFor(() => expect(rateCapsApi.setEnabled).toHaveBeenCalledWith(true));
});
test("adds a district cap in paise", async () => {
  vi.mocked(rateCapsApi.create).mockResolvedValue(cap);
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("₹1000.00");
  await user.click(screen.getByRole("button", { name: "Add a cap" }));
  expect(await screen.findByText(/Choose a category and operation/)).toBeInTheDocument();
  expect(rateCapsApi.create).not.toHaveBeenCalled();
  await user.selectOptions(await screen.findByLabelText("Equipment category"), "c1");
  await user.selectOptions(screen.getByLabelText("Operation"), "o1");
  await user.selectOptions(screen.getByLabelText("District"), "d1");
  await user.type(screen.getByLabelText("Maximum rate (₹)"), "600");
  await user.click(screen.getByRole("button", { name: "Add a cap" }));
  await waitFor(() =>
    expect(rateCapsApi.create).toHaveBeenCalledWith({
      categoryId: "c1",
      operationId: "o1",
      pricingBasis: "ACRE",
      maxRatePaise: 60000,
      districtId: "d1",
    }),
  );
});
test("deactivates a cap", async () => {
  vi.mocked(rateCapsApi.update).mockResolvedValue({ ...cap, isActive: false });
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole("button", { name: "Deactivate" }));
  await waitFor(() => expect(rateCapsApi.update).toHaveBeenCalledWith("cap1", { isActive: false }));
});
