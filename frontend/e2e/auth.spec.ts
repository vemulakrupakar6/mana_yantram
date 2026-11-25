import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const password = "Mana browser passphrase";
const next = "Mana new browser passphrase";
const uniqueUsername = () => "e2e_" + randomUUID().slice(0, 12);

async function register(
  page: Page,
  username: string,
  role: "Farmer" | "Service Provider" = "Farmer",
) {
  await page.goto("/register");
  await page.getByRole("radio", { name: new RegExp("^" + role) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByLabel("I accept the terms of use.").check();
  await page.getByLabel("I accept the privacy notice.").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}
async function login(page: Page, username: string, passphrase = password) {
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
}
test("farmer registration, cookie restoration, expired access refresh, password change and logout", async ({
  page,
  context,
}) => {
  const username = uniqueUsername();
  await register(page, username);
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByRole("heading", { name: "Set up your farmer profile" })).toBeVisible();
  expect(await context.cookies("http://localhost:5100/api/v1/auth/refresh")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "mana_refresh",
        httpOnly: true,
        sameSite: "Lax",
        path: "/api/v1/auth",
      }),
    ]),
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["mana-language"]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Set up your farmer profile" })).toBeVisible();

  // The profile is not filled in yet, so open the dashboard through the preview flag.
  await page.goto("/farmer/dashboard");
  await expect(page.getByRole("heading", { name: "Farmer dashboard" })).toBeVisible();
  await expect(page.getByText("No bookings to show.")).toBeVisible();
  await page.waitForTimeout(15_500); // The browser test API issues fifteen-second access tokens.
  const renewal = page.waitForResponse(
    (response) => response.url().endsWith("/auth/refresh") && response.status() === 200,
  );
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await renewal;
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(username);
  await page.getByLabel("Display name").fill("Mana Browser Farmer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Account changes saved.")).toBeVisible();

  await page.getByRole("link", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByText("Password updated. Sign in with your new password.")).toBeVisible();
  await login(page, username, next);
  await expect(page).toHaveURL("/onboarding");

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL("/403");
  await expect(
    page.getByRole("heading", { name: "You do not have permission to access this page." }),
  ).toBeVisible();
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/profile");
  await expect(page).toHaveURL("/login");
  await login(page, username, next);
  await expect(page).toHaveURL("/profile");
  await expect(page.getByLabel("Display name")).toHaveValue("Mana Browser Farmer");
});
test("provider registration, provider-type onboarding and duplicate field feedback", async ({
  page,
}) => {
  const username = uniqueUsername();
  await register(page, username, "Service Provider");
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByRole("heading", { name: "Register your service unit" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await register(page, username.toUpperCase(), "Service Provider");
  await expect(page.getByText("That username is already taken.")).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
});
test("360px landing, Telugu persistence, and keyboard navigation to the login form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Book Farm Machinery & Agricultural Services" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("button", { name: "తెలుగు" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});
