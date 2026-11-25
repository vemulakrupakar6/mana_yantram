import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { submissionApi } from "@/api/admin-providers.api";
import { providersApi } from "@/api/providers.api";
import { VerificationTimeline } from "@/components/provider/VerificationTimeline";
import { RemarksDialog } from "@/components/ui/remarks-dialog";
import { setLanguage } from "@/config/i18n";
import { useAuth } from "@/stores/auth";
import type { Checklist, Provider } from "@/types/provider";
import type { HistoryItem } from "@/types/verification";
import { ProviderDashboard } from "./ProviderDashboard";

vi.mock("@/api/providers.api", () => ({ providersApi: { me: vi.fn(), checklist: vi.fn() } }));
vi.mock("@/api/admin-providers.api", () => ({
  submissionApi: { submit: vi.fn(), history: vi.fn() },
}));
beforeEach(async () => {
  await setLanguage("en");
  vi.mocked(providersApi.me).mockReset();
  vi.mocked(providersApi.checklist).mockReset();
  vi.mocked(submissionApi.submit).mockReset();
  vi.mocked(submissionApi.history).mockResolvedValue([]);
  useAuth.getState().setSession({
    accessToken: "t",
    user: {
      id: "u",
      username: "prov",
      displayName: "Prov",
      roles: ["PROVIDER"],
      permissions: ["portal:provider"],
      preferredLanguage: "en",
      onboarding: { PROVIDER: "COMPLETED" },
      mustChangePassword: false,
      jurisdiction: null,
    },
  });
});

const provider = (status: Provider["status"]): Provider =>
  ({
    id: "p1",
    providerNo: "PRV26000001",
    status,
    latestReturn:
      status === "RETURNED"
        ? { remarks: "Fix the GSTIN", fieldRemarks: null, createdAt: "2030-01-01T00:00:00Z" }
        : null,
    counts: { equipment: 1, units: 2, operators: 0 },
    editable: { profile: true, equipment: true, coverage: true, operators: true },
  }) as Provider;
const checklist = (canSubmit: boolean): Checklist => ({
  canSubmit,
  items: [
    { key: "profile", done: true },
    { key: "bankAccount", done: canSubmit },
  ],
});
function renderDashboard() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ProviderDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("the submit button stays disabled until the checklist is complete", async () => {
  vi.mocked(providersApi.me).mockResolvedValue(provider("DRAFT"));
  vi.mocked(providersApi.checklist).mockResolvedValue(checklist(false));
  renderDashboard();
  const button = await screen.findByRole("button", { name: "Submit for verification" });
  expect(button).toBeDisabled();
  expect(await screen.findByText("Complete every checklist item to submit.")).toBeVisible();
});
test("a complete application is submitted only after confirming", async () => {
  vi.mocked(providersApi.me).mockResolvedValue(provider("DRAFT"));
  vi.mocked(providersApi.checklist).mockResolvedValue(checklist(true));
  vi.mocked(submissionApi.submit).mockResolvedValue(provider("SUBMITTED"));
  const user = userEvent.setup();
  renderDashboard();
  const button = await screen.findByRole("button", { name: "Submit for verification" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  expect(submissionApi.submit).not.toHaveBeenCalled(); // the dialog asks first
  expect(await screen.findByText("Submit your application?")).toBeVisible();
  const dialog = screen.getByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Submit for verification" }));
  await waitFor(() => expect(submissionApi.submit).toHaveBeenCalledTimes(1));
});
test("a RETURNED application shows the officer's remarks and offers resubmission", async () => {
  vi.mocked(providersApi.me).mockResolvedValue(provider("RETURNED"));
  vi.mocked(providersApi.checklist).mockResolvedValue(checklist(true));
  renderDashboard();
  expect(await screen.findByText("Fix the highlighted items and resubmit.")).toBeVisible();
  expect(screen.getByRole("note")).toHaveTextContent("Fix the GSTIN");
  expect(
    await screen.findByRole("button", { name: "Resubmit for verification" }),
  ).toBeInTheDocument();
});
test("SUBMITTED and APPROVED applications offer no submit button", async () => {
  vi.mocked(providersApi.checklist).mockResolvedValue(checklist(true));
  for (const status of ["SUBMITTED", "APPROVED"] as const) {
    vi.mocked(providersApi.me).mockResolvedValue(provider(status));
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProviderDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText(
      status === "SUBMITTED"
        ? "Under review by the department. Editing is locked."
        : "Your application is approved. You can now receive bookings.",
    );
    expect(screen.queryByRole("button", { name: /for verification/ })).toBeNull();
    unmount();
  }
});

test("remarks dialog enforces the minimum length before confirming", async () => {
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <RemarksDialog
      trigger={<button>Open</button>}
      title="Reject"
      action="Reject now"
      label="Remarks"
      onConfirm={onConfirm}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open" }));
  const confirm = screen.getByRole("button", { name: "Reject now" });
  expect(confirm).toBeDisabled();
  await user.type(screen.getByLabelText("Remarks"), "ab");
  expect(confirm).toBeDisabled();
  expect(screen.getByText("Enter at least 3 characters.")).toBeVisible();
  await user.type(screen.getByLabelText("Remarks"), "c  ");
  expect(confirm).toBeEnabled();
  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith("abc");
});
test("optional remarks can be left blank", async () => {
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <RemarksDialog
      trigger={<button>Open</button>}
      title="Reinstate"
      action="Reinstate now"
      label="Remarks"
      required={false}
      onConfirm={onConfirm}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open" }));
  await user.click(screen.getByRole("button", { name: "Reinstate now" }));
  expect(onConfirm).toHaveBeenCalledWith("");
});

test("the timeline names the actor by role and shows remarks, never usernames", () => {
  const items: HistoryItem[] = [
    {
      id: "2",
      action: "RETURN",
      fromStatus: "SUBMITTED",
      toStatus: "RETURNED",
      remarks: "Blurry ID",
      fieldRemarks: { name: "Use the registered name" },
      createdAt: "2030-01-02T10:00:00Z",
      actorRole: "DISTRICT_OFFICER",
      actorRoleName: "District Officer",
    },
    {
      id: "1",
      action: "SUBMIT",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      remarks: null,
      fieldRemarks: null,
      createdAt: "2030-01-01T10:00:00Z",
      actorRole: "PROVIDER",
      actorRoleName: "Service Provider",
    },
  ];
  render(<VerificationTimeline items={items} />);
  const rows = screen.getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Returned for changes");
  expect(rows[0]).toHaveTextContent("District Officer");
  expect(rows[0]).toHaveTextContent("Blurry ID");
  expect(rows[0]).toHaveTextContent("Unit name: Use the registered name");
  expect(rows[1]).toHaveTextContent("Submitted");
  expect(rows[1]).toHaveTextContent("Service Provider");
});
test("the timeline shows an empty message", () => {
  render(<VerificationTimeline items={[]} />);
  expect(screen.getByText("No activity yet.")).toBeVisible();
});
