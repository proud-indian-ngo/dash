import { expect, test } from "../../fixtures/test";

const ROLES_WITH_VIEW_ALL = new Set(["super_admin", "admin", "finance_admin"]);
// Roles that hold requests.approve — drives "Pending Reviews" label.
const ROLES_WITH_APPROVE = new Set(["super_admin", "finance_admin"]);

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows dashboard heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("shows New Reimbursement button", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "unoriented_volunteer",
      "Unoriented volunteers see orientation prompt instead"
    );
    await expect(
      page.getByRole("button", { name: "New Reimbursement" })
    ).toBeVisible();
  });

  test("shows stats cards", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "unoriented_volunteer",
      "Unoriented volunteers see orientation prompt instead"
    );

    const main = page.getByRole("main");
    const canViewAllRequests = ROLES_WITH_VIEW_ALL.has(testInfo.project.name);
    const canApprove = ROLES_WITH_APPROVE.has(testInfo.project.name);

    await expect(
      main.getByRole("link", {
        name: canViewAllRequests ? /All Reimbursements/ : /My Reimbursements/,
      })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      main.getByRole("link", {
        name: canApprove ? /Pending Reviews/ : /My Pending/,
      })
    ).toBeVisible();

    if (canViewAllRequests) {
      await expect(
        main.getByRole("link", { name: /Total Users/ })
      ).toBeVisible();
      await expect(
        main.getByRole("link", { name: /Vendor Payments/ })
      ).toBeVisible();
    }
  });
});
