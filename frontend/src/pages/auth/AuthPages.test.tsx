import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { setLanguage } from "@/config/i18n";
import { LoginPage } from "./LoginPage";
import { AccountRegistrationPage, RoleRegistrationPage } from "./RegisterPages";
import { ProtectedRoute, safeReturn } from "@/routes/access";
import { useAuth } from "@/stores/auth";
import { login } from "@/features/auth/session";

vi.mock("@/features/auth/session", () => ({ login: vi.fn(), register: vi.fn() }));
beforeEach(async () => {
  await setLanguage("en");
  useAuth.getState().clear();
  vi.mocked(login).mockReset();
});
test("validates login and toggles password visibility using its accessible name", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByText("This field is required.")).toBeVisible();
  expect(login).not.toHaveBeenCalled();
  const input = screen.getByLabelText("Password", { exact: true });
  expect(input).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(input).toHaveAttribute("type", "text");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(input).toHaveAttribute("type", "password");
});
test("locks the login form submit button while authentication is pending", async () => {
  vi.mocked(login).mockReturnValue(new Promise(() => {}));
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText("Username"), "farmer");
  await user.type(screen.getByLabelText("Password", { exact: true }), "some passphrase");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("aria-busy", "true");
});
test("shows two public roles and requires matching passwords and policy consent", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RoleRegistrationPage />} />
        <Route path="/register/account" element={<AccountRegistrationPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: /^Service Provider/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Service Provider")).toBeVisible();
  await user.type(screen.getByLabelText("Username"), "my-provider");
  await user.type(screen.getByLabelText("Password", { exact: true }), "valid passphrase");
  await user.type(screen.getByLabelText("Confirm password"), "different password");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByText("Passwords must match.")).toBeVisible();
  expect(screen.getAllByText("You must accept this policy to continue.")).toHaveLength(2);
});
test("shows a loader before any protected content when restoring a session", () => {
  useAuth.setState({ isInitializing: true });
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<h1>Private content</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Private content" })).toBeNull();
});
test("only permits known local return destinations", () => {
  expect(safeReturn("/profile?tab=details#current")).toBe("/profile?tab=details#current");
  for (const destination of [
    "//example.invalid",
    "https://example.invalid",
    "/\\example.invalid",
    "/%2ffarmer/dashboard",
    "/unknown",
  ]) {
    expect(safeReturn(destination)).toBeNull();
  }
});
