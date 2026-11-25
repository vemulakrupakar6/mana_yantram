import { expect, test, type Page } from "@playwright/test";
import {
  actor,
  closeDatabase,
  createDepartmentUser,
  files,
  geoNames,
  login,
  overflowsHorizontally,
  password,
  pickGeo,
  registerAccount,
  uniqueMobile,
  uniqueUsername,
} from "./helpers";

// One provider is carried through every scenario, so these tests run in order.
test.describe.configure({ mode: "serial" });

// The unit name is unique per run so the queue lookups never match leftovers from earlier runs.
const provider = {
  username: uniqueUsername("e2e_prov"),
  unit: "Sri Rama Agro " + uniqueUsername("u"),
};
let officer: string;
let stateAdmin: string;

test.beforeAll(async () => {
  officer = await createDepartmentUser("DISTRICT_OFFICER", "DISTRICT");
  stateAdmin = await createDepartmentUser("STATE_ADMIN", "STATE");
});
test.afterAll(async () => {
  await closeDatabase();
});

const uploadDocument = async (page: Page, selector: string) => {
  await page.locator(selector).setInputFiles(files.pdf);
  await expect(page.getByText("Document saved.").first()).toBeVisible();
};

// Scenario 2: provider registers, builds the whole application and submits it.
test("provider registers, completes the application and submits it", async ({ page }) => {
  await registerAccount(page, provider.username, "Service Provider");
  await expect(page).toHaveURL("/onboarding");

  // Step 1: provider type cards. Step 2: unit profile.
  await page.getByRole("radio", { name: /^Individual/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Unit or business name").fill(provider.unit);
  await page.getByLabel("Contact person").fill("Rama Rao");
  await page.getByLabel("Mobile number").fill(uniqueMobile());
  await page.getByLabel("Address").fill("Main road, near bus stand");
  await pickGeo(page);
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL("/provider/dashboard");
  await expect(page.getByRole("heading", { name: "Provider dashboard" })).toBeVisible();
  await expect(page.getByText("Complete the checklist and submit for verification.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for verification" })).toBeDisabled();

  // Bank account (the number is entered twice and shown masked afterwards).
  await page.goto("/provider/bank");
  await page.getByLabel("Account holder name").fill("Rama Rao");
  await page.getByLabel("Account number", { exact: true }).fill("123456789012");
  await page.getByLabel("Confirm account number").fill("123456789012");
  await page.getByLabel("IFSC", { exact: true }).fill("SBIN0001234");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("XXXXXX9012")).toBeVisible();
  await expect(page.getByText("123456789012")).toHaveCount(0);

  // Equipment: details, then photo and units, then the rate card.
  await page.goto("/provider/equipment/new");
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Tractor" });
  await page.getByLabel("Make", { exact: true }).fill("Mahindra");
  await page.getByLabel("Model", { exact: true }).fill("575 DI");
  await page.getByLabel("Year of manufacture").fill("2021");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Number of machines").fill("2");
  await page.locator("#eq-photos").setInputFiles(files.photo);
  await expect(page.getByRole("img", { name: "photo.png" })).toBeVisible();
  await page.getByRole("button", { name: "Create equipment" }).click();

  await expect(page).toHaveURL(/\/provider\/equipment\/[0-9a-f-]{36}\?tab=rates/);
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByLabel("Operation", { exact: true }).selectOption({ label: "Ploughing" });
  await page.getByLabel("Rate (₹)").fill("800");
  await page.getByLabel("Work rate (acres per hour)").fill("1.5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("cell", { name: /₹800\.00 \/ acre/ })).toBeVisible();

  // Documents: ID proof and bank proof, plus the machine RC that the tractor now requires.
  await page.goto("/provider/documents");
  await expect(page.getByText("Machine registration certificate (RC)")).toBeVisible();
  await uploadDocument(page, "#doc-ID_PROOF");
  await uploadDocument(page, "#doc-BANK_PROOF");
  await uploadDocument(page, 'input[id^="doc-MACHINE_RC"]');
  await expect(page.getByText("Pending review")).toHaveCount(3);

  // Coverage and working hours.
  await page.goto("/provider/coverage");
  await page.getByLabel("Radius (km)").fill("25");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText("Changes saved.").first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Monday" }).check();
  await page.getByRole("button", { name: "Save changes" }).nth(1).click();

  // Everything is ticked off, so submitting is now possible (after a confirmation).
  await page.goto("/provider/dashboard");
  await expect(page.getByText("Complete every checklist item to submit.")).toHaveCount(0);
  const submit = page.getByRole("button", { name: "Submit for verification" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Submit for verification" })
    .click();
  await expect(page.getByText("Under review by the department. Editing is locked.")).toBeVisible();
  await expect(page.getByRole("button", { name: /for verification/ })).toHaveCount(0);

  // Locked: the profile form is read-only now.
  await page.goto("/provider/profile");
  await expect(
    page.getByText("The profile cannot be edited while the application is in this state."),
  ).toBeVisible();
});

// Scenario 3: the district officer returns it with remarks, the provider fixes and resubmits,
// the officer accepts everything and approves, and the provider sees APPROVED.
test("officer returns the application, provider resubmits, officer approves", async ({
  browser,
}) => {
  const officerSession = await actor(browser, officer);
  const op = officerSession.page;
  await op.goto("/admin/providers");
  await expect(op.getByRole("tab", { name: "Submitted", selected: true })).toBeVisible();
  await op.getByLabel("Search").fill(provider.unit);
  await op.getByRole("button", { name: "Apply filters" }).click();
  await op
    .getByRole("row", { name: new RegExp(provider.unit) })
    .getByRole("link")
    .click();
  await expect(op.getByRole("heading", { name: provider.unit })).toBeVisible();
  await expect(op.getByText("XXXXXX9012")).toBeVisible();

  // Approval is blocked until everything is accepted, and the button says so.
  const approve = op.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeDisabled();

  // Return the ID proof with a remark, then return the whole application with a field remark.
  const idRow = op.getByRole("row", { name: /Identity proof/ });
  await idRow.getByRole("button", { name: "Return" }).click();
  await op.getByRole("alertdialog").getByLabel("Remarks").fill("The ID photo is blurry");
  await op.getByRole("alertdialog").getByRole("button", { name: "Return" }).click();
  await expect(idRow.getByText("The ID photo is blurry")).toBeVisible();
  await op.getByLabel("Remark for Unit or business name").fill("Use your registered business name");
  await op.getByRole("button", { name: "Return for changes" }).click();
  await op
    .getByRole("alertdialog")
    .getByLabel("General remarks")
    .fill("Please fix the items below");
  await op.getByRole("alertdialog").getByRole("button", { name: "Return for changes" }).click();
  await expect(op.getByText("Returned for changes").first()).toBeVisible();
  await expect(op.getByText("Please fix the items below").first()).toBeVisible();

  // The provider sees the remarks inline, replaces the document and resubmits.
  const providerSession = await actor(browser, provider.username);
  const pp = providerSession.page;
  await pp.goto("/provider/dashboard");
  await expect(pp.getByText("Fix the highlighted items and resubmit.")).toBeVisible();
  await expect(pp.getByText("Please fix the items below").first()).toBeVisible();
  await expect(pp.getByRole("button", { name: "Resubmit for verification" })).toBeDisabled(); // a document is still returned
  await pp.goto("/provider/documents");
  await expect(pp.getByText("Officer remark: The ID photo is blurry")).toBeVisible();
  await uploadDocument(pp, "#doc-ID_PROOF");
  await pp.goto("/provider/profile");
  await expect(pp.getByText("Officer remark: Use your registered business name")).toBeVisible();
  await pp.goto("/provider/dashboard");
  await pp.getByRole("button", { name: "Resubmit for verification" }).click();
  await pp
    .getByRole("alertdialog")
    .getByRole("button", { name: "Submit for verification" })
    .click();
  await expect(pp.getByText("Under review by the department. Editing is locked.")).toBeVisible();
  // The history shows the whole conversation, by role and never by username.
  await expect(pp.getByText("Returned for changes")).toBeVisible();
  await expect(pp.getByText(officer)).toHaveCount(0);

  // The officer accepts everything and approves.
  await op.reload();
  await expect(op.getByRole("heading", { name: provider.unit })).toBeVisible();
  await op.getByRole("button", { name: "Accept all pending" }).click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(op.getByText("Approved", { exact: true }).first()).toBeVisible();

  await pp.reload();
  await expect(
    pp.getByText("Your application is approved. You can now receive bookings."),
  ).toBeVisible();
  await pp.goto("/provider/profile");
  await expect(
    pp.getByText("The profile cannot be edited while the application is in this state."),
  ).toBeVisible();

  // Review screen and queue stay usable at phone, tablet and desktop widths.
  for (const width of [360, 768, 1440]) {
    await op.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/providers?status=APPROVED", `/admin/providers`]) {
      await op.goto(path);
      expect(await overflowsHorizontally(op), `${path} at ${width}px`).toBe(false);
    }
    await op.goto("/admin/providers?status=APPROVED");
    await op
      .getByRole("row", { name: new RegExp(provider.unit) })
      .getByRole("link")
      .click();
    await expect(op.getByRole("heading", { name: provider.unit })).toBeVisible();
    expect(await overflowsHorizontally(op), `review page at ${width}px`).toBe(false);
  }
  await officerSession.context.close();
  await providerSession.context.close();
  expect(geoNames.district).toBeTruthy();
});

// Scenario 4: an administrator deactivates the provider, who then cannot sign in.
test("admin deactivates the provider and sign-in shows the deactivated message", async ({
  browser,
  page,
}) => {
  const adminSession = await actor(browser, stateAdmin);
  const ap = adminSession.page;
  await ap.goto("/admin/users");
  await ap.getByLabel("Search").fill(provider.username);
  await ap.getByRole("button", { name: "Apply filters" }).click();
  await ap.getByRole("link", { name: provider.username }).click();
  await expect(
    ap
      .getByRole("heading", { name: provider.unit })
      .or(ap.getByRole("heading", { name: provider.username })),
  ).toBeVisible();
  await ap.getByLabel("Reason (5–300 characters)").fill("Left the programme");
  await ap.getByRole("button", { name: "Deactivate", exact: true }).click();
  await ap.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(ap.getByText("User deactivated.")).toBeVisible();
  await expect(ap.getByText("Deactivated", { exact: true }).first()).toBeVisible();

  await login(page, provider.username);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your account has been deactivated. Contact the department." }),
  ).toBeVisible();
  await expect(page).toHaveURL("/login");
  // A wrong password still gets the generic message, so deactivation is not revealed to guessers.
  await login(page, provider.username, "definitely not the password");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  // The administrator can undo it.
  await ap.getByRole("button", { name: "Reactivate" }).click();
  await expect(ap.getByText("User reactivated.")).toBeVisible();
  await login(page, provider.username, password);
  await expect(page).toHaveURL("/provider/dashboard");
  await adminSession.context.close();
});
