import { expect, test, waitForZeroReady } from "../../fixtures/test";

const SUPER_ADMIN_SEED_REIMBURSEMENT_ID =
  "e2e00000-0000-0000-0000-000000000001";
const SEED_TITLE = "E2E Seed Reimbursement";

const ROLES_WITH_VIEW_ALL = new Set(["super_admin", "admin", "finance_admin"]);

test.describe("Data isolation — volunteer cannot see super_admin's data", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer does not see super_admin's seed reimbursement in list", async ({
    page,
  }) => {
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Allow data to load
    await page.waitForTimeout(2000);

    // The super_admin's seeded reimbursement should NOT appear for the volunteer
    await expect(page.getByText(SEED_TITLE, { exact: true })).toBeHidden();
  });

  test("volunteer cannot access super_admin reimbursement detail by direct URL", async ({
    page,
  }) => {
    await page.goto(`/reimbursements/${SUPER_ADMIN_SEED_REIMBURSEMENT_ID}`);
    await waitForZeroReady(page);

    // Either redirected to list/home, or shown a not-found state
    const redirectedOrNotFound = await Promise.race([
      page
        .waitForURL("/reimbursements", { timeout: 5000 })
        .then(() => "redirected"),
      page.waitForURL("/", { timeout: 5000 }).then(() => "redirected"),
      page
        .getByText(/not found|no access|not authorized/i)
        .waitFor({ timeout: 5000 })
        .then(() => "notfound"),
    ]).catch(() => "loaded");

    // If the page loaded, verify it doesn't show the super_admin's reimbursement title
    if (redirectedOrNotFound === "loaded") {
      await expect(page.getByText(SEED_TITLE, { exact: true })).toBeHidden({
        timeout: 5000,
      });
    }
  });

  test("volunteer only sees own reimbursements count", async ({ page }) => {
    await page.goto("/reimbursements");
    await waitForZeroReady(page);

    // Allow time for Zero sync
    await page.waitForTimeout(2000);

    // Volunteer shouldn't see super_admin-submitted rows
    const rows = page.getByRole("table").getByRole("row");
    const rowCount = await rows.count();

    // Every visible row (excluding header) should NOT contain super_admin's seed reimbursement
    for (let i = 1; i < Math.min(rowCount, 10); i++) {
      await expect(rows.nth(i)).not.toContainText(SEED_TITLE);
    }
  });
});

test.describe("View scope — view_all roles see seed reimbursement", () => {
  test("super_admin / admin / finance_admin see seed reimbursement", async ({
    page,
  }, testInfo) => {
    test.skip(
      !ROLES_WITH_VIEW_ALL.has(testInfo.project.name),
      "Only roles with requests.view_all"
    );

    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Filter to surface seed row past pagination
    await page
      .getByRole("textbox", { name: "Search reimbursements..." })
      .fill(SEED_TITLE);

    await expect(
      page.getByText(SEED_TITLE, { exact: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Data isolation — unoriented_volunteer redirected from /reimbursements", () => {
  test("unoriented_volunteer cannot reach reimbursements list", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );

    await page.goto("/reimbursements");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });
});
