import { expect, test } from "../../fixtures/test";

async function expectRedirectToDashboard(
  page: import("@playwright/test").Page,
  url: string
) {
  await page.goto(url);
  await page.waitForURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function expectPageHeading(
  page: import("@playwright/test").Page,
  url: string,
  heading: string
) {
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: heading, exact: true })
  ).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Volunteer role restrictions", () => {
  test("volunteer is redirected from /users to /", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await expectRedirectToDashboard(page, "/users");
  });

  test("volunteer sees reimbursements list (data isolation)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Wait for table to load
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });
  });

  test("super_admin sees reimbursements page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin-only test");
    await expectPageHeading(page, "/reimbursements", "Reimbursements");
  });
});

test.describe("Admin role access", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin can view reimbursements", async ({ page }) => {
    await expectPageHeading(page, "/reimbursements", "Reimbursements");
  });

  test("admin can view vendors", async ({ page }) => {
    await expectPageHeading(page, "/vendors", "Vendors");
  });

  test("admin redirected from /settings/roles", async ({ page }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });
});

test.describe("Finance admin role access", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance-admin only");
  });

  test("finance_admin can view reimbursements", async ({ page }) => {
    await expectPageHeading(page, "/reimbursements", "Reimbursements");
  });

  test("finance_admin can view vendors", async ({ page }) => {
    await expectPageHeading(page, "/vendors", "Vendors");
  });

  test("finance_admin redirected from /settings/roles", async ({ page }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });
});

test.describe("Unoriented volunteer restrictions", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
  });

  test("unoriented_volunteer redirected from /reimbursements", async ({
    page,
  }) => {
    await expectRedirectToDashboard(page, "/reimbursements");
  });

  test("unoriented_volunteer redirected from /vendors", async ({ page }) => {
    await expectRedirectToDashboard(page, "/vendors");
  });

  test("unoriented_volunteer redirected from /teams", async ({ page }) => {
    await expectRedirectToDashboard(page, "/teams");
  });

  test("unoriented_volunteer can view /events", async ({ page }) => {
    await expectPageHeading(page, "/events", "Events");
  });
});
