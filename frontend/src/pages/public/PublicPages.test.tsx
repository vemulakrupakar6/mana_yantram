import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { setLanguage } from "@/config/i18n";
import App from "@/App";

vi.mock("@/features/auth/session", () => ({ restoreSession: vi.fn() }));

beforeEach(async () => {
  await setLanguage("en");
});
test("renders sample categories and links to services", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("heading", { name: "Book Farm Machinery & Agricultural Services" }),
  ).toBeVisible();
  expect(screen.getByText("Sample categories for each stage of the farming season.")).toBeVisible();
  await userEvent.click(screen.getByRole("link", { name: "Browse services" }));
  expect(screen.getByRole("heading", { name: "Services", level: 1 })).toBeVisible();
});
test("switches to Telugu and persists the preference", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "తెలుగు" }));
  expect(document.documentElement).toHaveAttribute("lang", "te");
  expect(localStorage.getItem("mana-language")).toBe("te");
});
