import { randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { RoleCode } from "@prisma/client";
import { expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { database } from "../../backend/src/config/database.js";
import { hashPassword } from "../../backend/src/utils/password.js";

export const password = "Mana browser passphrase";
// Paths passed to the API context must stay relative ("auth/register"): a leading slash would drop /api/v1.
export const apiBase = "http://localhost:5100/api/v1";
export const fixture = (name: string) =>
  fileURLToPath(new URL("./fixtures/" + name, import.meta.url));
export const files = { pdf: fixture("document.pdf"), photo: fixture("photo.png") };

export const uniqueUsername = (prefix = "e2e") => prefix + "_" + randomUUID().slice(0, 10);
/** A valid, unlikely-to-collide Indian mobile number. */
export const uniqueMobile = () => "9" + String(randomInt(0, 1e9)).padStart(9, "0");

export const geoNames = {
  district: "Sample District A",
  mandal: "Sample Mandal A1",
  village: "Sample Village A1a",
};

/* ------------------------------ database helpers ------------------------------ */

/** Creates an active department user directly in the test database (there is no public sign-up). */
export async function createDepartmentUser(
  role: RoleCode,
  level: "STATE" | "DISTRICT",
  districtLgd = "T001",
) {
  const roleRow = await database.role.findUniqueOrThrow({ where: { code: role } });
  const district =
    level === "DISTRICT"
      ? await database.district.findUniqueOrThrow({ where: { lgdCode: districtLgd } })
      : null;
  const username = uniqueUsername("e2e_" + role.toLowerCase().replace(/_/g, "").slice(0, 6));
  await database.user.create({
    data: {
      username,
      displayName: "E2E " + role,
      passwordHash: await hashPassword(password),
      roles: { create: { roleId: roleRow.id } },
      onboarding: { create: { roleId: roleRow.id, status: "COMPLETED", completedAt: new Date() } },
      jurisdiction: { create: { level, districtId: district?.id } },
    },
  });
  return username;
}
export async function closeDatabase() {
  await database.$disconnect();
}

/* --------------------------------- UI helpers --------------------------------- */

export async function registerAccount(
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
export async function login(page: Page, username: string, passphrase = password) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
}
/** A fresh browser context (own cookies), optionally already signed in. */
export async function actor(browser: Browser, username?: string) {
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  // Diagnostics: any rejected API call is printed with the actor, which makes session problems traceable.
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/") && [401, 403, 429].includes(response.status()))
      console.log(`[e2e] ${username ?? "anonymous"} ${response.status()} ${response.request().method()} ${response.url().replace(apiBase, "")}`);
  });
  if (username) {
    await login(page, username);
    await expect(page).not.toHaveURL(/\/login/);
  }
  return { context, page };
}
export async function pickGeo(page: Page) {
  await page.getByLabel("District", { exact: true }).selectOption({ label: geoNames.district });
  await page.getByLabel("Mandal", { exact: true }).selectOption({ label: geoNames.mandal });
  await page.getByLabel("Village", { exact: true }).selectOption({ label: geoNames.village });
}

/* ------------------------------- API-side setup ------------------------------- */

const csrf = { "X-CSRF-Protection": "1" };
/** Register an account through the API and return a bearer token, for fast test setup. */
export async function apiAccount(role: "FARMER" | "PROVIDER") {
  const api = await request.newContext({ baseURL: apiBase + "/", extraHTTPHeaders: csrf });
  const username = uniqueUsername("e2e_api");
  const response = await api.post("auth/register", {
    data: {
      username,
      password,
      confirmPassword: password,
      role,
      preferredLanguage: "en",
      acceptTerms: true,
      acceptPrivacyPolicy: true,
    },
  });
  expect(response.status()).toBe(201);
  const token: string = (await response.json()).data.accessToken;
  return { api, username, token, auth: { Authorization: "Bearer " + token } };
}
async function geoIds() {
  const district = await database.district.findUniqueOrThrow({
    where: { lgdCode: "T001" },
    include: {
      mandals: {
        orderBy: { lgdCode: "asc" },
        include: { villages: { orderBy: { lgdCode: "asc" } } },
      },
    },
  });
  return {
    districtId: district.id,
    mandalId: district.mandals[0].id,
    villageId: district.mandals[0].villages[0].id,
  };
}
export async function apiFarmerWithProfile() {
  const account = await apiAccount("FARMER");
  const created = await account.api.post("farmers/me", {
    headers: account.auth,
    data: {
      fullName: "Ravi Kumar",
      relationType: "FATHER",
      relativeName: "Suresh Kumar",
      gender: "MALE",
      mobile: uniqueMobile(),
      ...(await geoIds()),
      preferredLanguage: "en",
      notifications: { sms: true, inApp: true, push: true },
    },
  });
  expect(created.status()).toBe(201);
  return account;
}
export async function apiProviderWithProfile() {
  const account = await apiAccount("PROVIDER");
  const created = await account.api.post("providers/me", {
    headers: account.auth,
    data: {
      type: "INDIVIDUAL",
      name: "Sri Rama Agro Services",
      contactPerson: "Rama Rao",
      mobile: uniqueMobile(),
      addressLine: "Main road, near bus stand",
      ...(await geoIds()),
      baseLatitude: 17.385,
      baseLongitude: 78.4867,
    },
  });
  expect(created.status()).toBe(201);
  return account;
}

/** True when the page scrolls sideways, i.e. something is wider than the viewport. */
export const overflowsHorizontally = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
