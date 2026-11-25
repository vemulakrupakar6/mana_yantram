import { expect, test } from "@playwright/test";
import { pickGeo, registerAccount, uniqueMobile, uniqueUsername } from "./helpers";

// Scenario 1: register, complete the farmer profile, add a plot.
test("farmer registers, completes the profile and adds a plot", async ({ page }) => {
  const username = uniqueUsername();
  await registerAccount(page, username);
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByRole("heading", { name: "Set up your farmer profile" })).toBeVisible();

  // Client-side validation comes first: nothing is sent while the form is invalid.
  await page.getByLabel("Aadhaar number (optional)").fill("123456789012");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This field is required.").first()).toBeVisible();
  await expect(page.getByText("Enter a valid 12-digit Aadhaar number.")).toBeVisible();
  await page.getByLabel("Aadhaar number (optional)").clear();

  await page.getByLabel("Full name").fill("Ravi Kumar");
  await page.getByLabel("Name of father or husband").fill("Suresh Kumar");
  await page.getByLabel("Mobile number").fill(uniqueMobile());
  await pickGeo(page);
  await page.getByRole("button", { name: "Continue" }).click();

  // Straight on to the first plot, which can be skipped.
  await expect(page).toHaveURL(/\/farmer\/plots\/new\?first=1/);
  await expect(page.getByRole("link", { name: "Skip for now" })).toBeVisible();
  await expect(page.getByLabel("Village", { exact: true })).not.toHaveValue(""); // defaults to the farmer's village
  await page.getByLabel("Survey number").fill("12/A");
  await page.getByLabel("Extent (acres)").fill("2.5");
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByRole("button", { name: "Add crop" }).click();
  await page.getByLabel("Crop", { exact: true }).selectOption({ label: "Paddy" });
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL("/farmer/plots");
  await expect(page.getByRole("cell", { name: "12/A" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2.50" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Paddy \(Kharif/ })).toBeVisible();

  // The dashboard and profile now reflect the saved data, and the profile survives a reload.
  await page.goto("/farmer/dashboard");
  await expect(page.getByRole("heading", { name: "Ravi Kumar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "1 plots" })).toBeVisible();
  await page.goto("/farmer/profile");
  await expect(page.getByLabel("Full name")).toHaveValue("Ravi Kumar");
  await expect(page.getByLabel("District", { exact: true })).not.toHaveValue("");
});
