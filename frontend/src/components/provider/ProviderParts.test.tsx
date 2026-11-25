import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { providersApi } from "@/api/providers.api";
import { setLanguage } from "@/config/i18n";
import { bankFormSchema, providerFormSchema } from "@/schemas/provider";
import type { ChecklistItem, ProviderStatus } from "@/types/provider";
import { Checklist, ProviderStatusBadge, RemarkNotice } from "./ProviderParts";
import { ProviderProfileForm, toPayload } from "./ProviderProfileForm";

vi.mock("@/api/providers.api", () => ({ providersApi: { create: vi.fn(), update: vi.fn() } }));
vi.mock("@/api/masters.api", () => ({
  mastersApi: { districts: async () => [], mandals: async () => [], villages: async () => [] },
}));
beforeEach(async () => {
  await setLanguage("en");
});

const items: ChecklistItem[] = [
  { key: "profile", done: true },
  { key: "bankAccount", done: false },
  { key: "documents", done: false, detail: { missing: ["ID_PROOF"], returned: 0 } },
  { key: "equipment", done: false },
  { key: "coverage", done: true },
  { key: "workingHours", done: false },
];
test("checklist shows every item with done/pending state and links only unfinished ones", () => {
  render(
    <MemoryRouter>
      <Checklist items={items} />
    </MemoryRouter>,
  );
  const list = screen.getAllByRole("listitem");
  expect(list).toHaveLength(6);
  expect(within(list[0]).getByText("Done")).toBeInTheDocument();
  expect(within(list[1]).getByText("Pending")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Unit profile" })).toBeNull(); // done: no link
  expect(screen.getByRole("link", { name: "Bank account" })).toHaveAttribute(
    "href",
    "/provider/bank",
  );
  expect(screen.getByRole("link", { name: "Required documents" })).toHaveAttribute(
    "href",
    "/provider/documents",
  );
});
test("status badge renders every provider status with its own label", () => {
  const statuses: ProviderStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "RETURNED",
    "APPROVED",
    "REJECTED",
    "SUSPENDED",
    "BLACKLISTED",
  ];
  const labels = [
    "Draft",
    "Submitted",
    "Returned",
    "Approved",
    "Rejected",
    "Suspended",
    "Blacklisted",
  ];
  statuses.forEach((status, i) => {
    const { unmount } = render(<ProviderStatusBadge status={status} />);
    expect(screen.getByText(labels[i])).toBeInTheDocument();
    unmount();
  });
});
test("remark notice renders nothing without text", () => {
  const { container, rerender } = render(<RemarkNotice text={null} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<RemarkNotice text="Blurry photo" />);
  expect(screen.getByRole("note")).toHaveTextContent("Officer remark: Blurry photo");
});

const valid = {
  type: "INDIVIDUAL" as const,
  name: "Sri Rama Agro",
  contactPerson: "Rama Rao",
  mobile: "9876543210",
  email: "",
  addressLine: "Main road",
  pincode: "",
  districtId: "d",
  mandalId: "m",
  villageId: "v",
  baseLatitude: "17.4",
  baseLongitude: "78.5",
  registrationNo: "",
  gstin: "",
};
test("provider schema requires a registration number for non-individuals and validates GSTIN", () => {
  expect(providerFormSchema.safeParse(valid).success).toBe(true);
  const fpo = providerFormSchema.safeParse({ ...valid, type: "FPO" });
  expect(fpo.success).toBe(false);
  expect(
    providerFormSchema.safeParse({ ...valid, type: "FPO", registrationNo: "REG-1" }).success,
  ).toBe(true);
  expect(providerFormSchema.safeParse({ ...valid, gstin: "36aabcu9603r1zx" }).success).toBe(true);
  for (const bad of [
    { gstin: "BAD" },
    { pincode: "012345" },
    { baseLatitude: "5" },
    { mobile: "123" },
  ])
    expect(providerFormSchema.safeParse({ ...valid, ...bad }).success).toBe(false);
});
test("payload: creation omits blanks, editing sends null, GSTIN is uppercased", () => {
  const created = toPayload({ ...valid, gstin: "36aabcu9603r1zx" }, false);
  expect(created).not.toHaveProperty("email", "");
  expect(created.email).toBeUndefined();
  expect(created.gstin).toBe("36AABCU9603R1ZX");
  expect(created.baseLatitude).toBe(17.4);
  const edited = toPayload({ ...valid, gstin: "", pincode: "" }, true);
  expect(edited.gstin).toBeNull();
  expect(edited.pincode).toBeNull();
  expect(edited.registrationNo).toBeNull();
});
test("bank schema checks digits, confirmation and IFSC", () => {
  const ok = {
    holderName: "Rama Rao",
    accountNumber: "123456789012",
    confirmAccountNumber: "123456789012",
    ifsc: "sbin0001234",
  };
  expect(bankFormSchema.safeParse(ok).success).toBe(true);
  for (const bad of [
    { accountNumber: "1234", confirmAccountNumber: "1234" },
    { confirmAccountNumber: "000000000000" },
    { ifsc: "SBIN1234567" },
  ])
    expect(bankFormSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
});

test("onboarding form starts with type cards, then asks for details; registration number appears for FPO", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProviderProfileForm onSaved={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("radio")).toHaveLength(4);
  await user.click(screen.getByRole("radio", { name: /FPO/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByLabelText("Registration number")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    await screen.findByText("A registration number is required for this provider type."),
  ).toBeVisible();
  expect(providersApi.create).not.toHaveBeenCalled();
});
