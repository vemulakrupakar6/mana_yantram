import { expect, test, type Page } from "@playwright/test";
import {
  actor,
  apiFarmerWithProfile,
  apiProviderWithProfile,
  closeDatabase,
  createDepartmentUser,
  overflowsHorizontally,
} from "./helpers";

// Automated stand-in for the manual responsive pass: every new page must fit the viewport
// (no sideways scrolling) at phone, tablet and desktop widths, and render its main heading.
const widths = [360, 768, 1440];

const routes: Record<string, string[]> = {
  farmer: ["/farmer/dashboard", "/farmer/profile", "/farmer/plots", "/farmer/plots/new"],
  provider: [
    "/provider/dashboard",
    "/provider/profile",
    "/provider/documents",
    "/provider/bank",
    "/provider/equipment",
    "/provider/equipment/new",
    "/provider/coverage",
    "/provider/operators",
    "/provider/operators/new",
    "/provider/availability",
  ],
  officer: [
    "/admin/dashboard",
    "/admin/providers",
    "/admin/farmers",
    "/admin/users",
    "/admin/users/new",
  ],
  agent: [
    "/admin/dashboard",
    "/admin/assisted-registration",
    "/admin/assisted-registration/new",
    "/admin/farmers",
  ],
};
let accounts: Record<string, string>;
test.beforeAll(async () => {
  const farmer = await apiFarmerWithProfile();
  const provider = await apiProviderWithProfile();
  accounts = {
    farmer: farmer.username,
    provider: provider.username,
    officer: await createDepartmentUser("DISTRICT_OFFICER", "DISTRICT"),
    agent: await createDepartmentUser("FIELD_AGENT", "DISTRICT"),
  };
});
test.afterAll(async () => {
  await closeDatabase();
});

async function check(page: Page, path: string, width: number) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(await overflowsHorizontally(page), `${path} overflows at ${width}px`).toBe(false);
}
for (const role of Object.keys(routes)) {
  test(`${role} pages fit 360, 768 and 1440 px`, async ({ browser }) => {
    const { context, page } = await actor(browser, accounts[role]);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes[role]) await check(page, path, width);
    }
    await context.close();
  });
}

test("the login and registration pages fit at every width, in Telugu too", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/register", "/register/account"]) {
      await page.goto(path);
      expect(await overflowsHorizontally(page), `${path} at ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/login");
  await page.getByRole("button", { name: "తెలుగు" }).click();
  expect(await overflowsHorizontally(page)).toBe(false);
  // Telugu strings are longer: the registration pages must still fit too.
  for (const path of ["/register", "/register/account"]) {
    await page.goto(path);
    expect(await overflowsHorizontally(page), `${path} in Telugu`).toBe(false);
  }
});
