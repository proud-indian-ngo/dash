import { expect, test, waitForZeroReady } from "../../fixtures/test";

const ADMIN_SEED_REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000001";

test.describe("Data isolation — volunteer cannot see admin's data", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer does not see admin's seed reimbursement in list", async ({
    page,
  }) => {
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Allow data to load
    await page.waitForTimeout(2000);

    // The admin's seeded reimbursement should NOT appear for the volunteer
    await expect(
      page.getByText("E2E Seed Reimbursement", { exact: true })
    ).toBeHidden();
  });

  test("volunteer cannot access admin reimbursement detail by direct URL", async ({
    page,
  }) => {
    await page.goto(`/reimbursements/${ADMIN_SEED_REIMBURSEMENT_ID}`);
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

    // If the page loaded, verify it doesn't show the admin's reimbursement title
    if (redirectedOrNotFound === "loaded") {
      await expect(
        page.getByText("E2E Seed Reimbursement", { exact: true })
      ).toBeHidden({ timeout: 5000 });
    }
  });

  test("volunteer only sees own reimbursements count", async ({ page }) => {
    await page.goto("/reimbursements");
    await waitForZeroReady(page);

    // Allow time for Zero sync
    await page.waitForTimeout(2000);

    // Volunteer shouldn't see admin-submitted rows
    const rows = page.getByRole("table").getByRole("row");
    const rowCount = await rows.count();

    // Every visible row (excluding header) should NOT contain admin's seed reimbursement
    for (let i = 1; i < Math.min(rowCount, 10); i++) {
      await expect(rows.nth(i)).not.toContainText("E2E Seed Reimbursement");
    }
  });
});
