import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { setLanguage } from "@/config/i18n";
import { filesApi } from "@/api/files.api";
import { MoneyField } from "./MoneyField";
import { FileUploadField } from "./FileUploadField";
import { paiseToRupees, rupeesToPaise } from "@/utils/money";

vi.mock("@/api/files.api", async (original) => ({
  ...(await original<typeof import("@/api/files.api")>()),
  filesApi: { upload: vi.fn(), blob: vi.fn(), remove: vi.fn() },
}));
beforeEach(async () => {
  await setLanguage("en");
  vi.mocked(filesApi.upload).mockReset();
});
const field = (onChange = vi.fn()) =>
  render(<FileUploadField id="doc" label="ID proof" value={null} onChange={onChange} />);
const input = () => document.getElementById("doc") as HTMLInputElement;

test("rejects an oversize file on the client without calling the API", async () => {
  const onChange = vi.fn();
  field(onChange);
  const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
  await userEvent.setup({ applyAccept: false }).upload(input(), big);
  expect(await screen.findByText("That file is too large.")).toBeVisible();
  expect(filesApi.upload).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});
test("rejects a disallowed type on the client", async () => {
  field();
  const exe = new File(["MZ"], "run.exe", { type: "application/x-msdownload" });
  await userEvent.setup({ applyAccept: false }).upload(input(), exe);
  expect(await screen.findByText("That file type is not allowed.")).toBeVisible();
  expect(filesApi.upload).not.toHaveBeenCalled();
});
test("uploads a valid file and reports it to the form", async () => {
  const uploaded = {
    id: "f1",
    url: "/api/v1/files/f1",
    originalName: "id.pdf",
    mimeType: "application/pdf",
  };
  vi.mocked(filesApi.upload).mockResolvedValue(uploaded);
  const onChange = vi.fn();
  field(onChange);
  await userEvent.upload(input(), new File(["%PDF-1.4"], "id.pdf", { type: "application/pdf" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(uploaded));
});
test("shows a server error when the upload fails", async () => {
  vi.mocked(filesApi.upload).mockRejectedValue(new Error("network"));
  field();
  await userEvent.upload(input(), new File(["%PDF-1.4"], "id.pdf", { type: "application/pdf" }));
  expect(await screen.findByText("The upload failed. Please try again.")).toBeVisible();
});
test("money converts between rupees and integer paise", () => {
  expect(rupeesToPaise("1,250.5")).toBe(125050);
  expect(rupeesToPaise("0.29")).toBe(29);
  expect(rupeesToPaise("12.345")).toBeNull();
  expect(rupeesToPaise("")).toBeNull();
  expect(rupeesToPaise("-1")).toBeNull();
  expect(paiseToRupees(125050)).toBe("1250.50");
  expect(paiseToRupees(null)).toBe("");
});
test("MoneyField emits paise while the user types rupees", async () => {
  const onChange = vi.fn();
  render(<MoneyField id="rate" label="Rate" value={null} onChange={onChange} />);
  await userEvent.type(screen.getByLabelText("Rate"), "450.5");
  expect(onChange).toHaveBeenLastCalledWith(45050);
});
