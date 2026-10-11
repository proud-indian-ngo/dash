import { expect, test } from "../../fixtures/test";

const ROLES_WITH_VIEW_ALL = new Set(["super_admin", "admin", "finance_admin"]);

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows dashboard heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("shows New reimbursement button", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "unoriented_volunteer",
      "Unoriented volunteers see orientation prompt instead"
    );
    await expect(
      page.getByRole("button", { name: "New reimbursement" })
    ).toBeVisible();
  });

  test("shows stat chips", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "unoriented_volunteer",
      "Unoriented volunteers see orientation prompt instead"
    );

    const labels = page.locator("[data-slot=stat-label]");
    const canViewAllRequests = ROLES_WITH_VIEW_ALL.has(testInfo.project.name);

    await expect(
      labels.filter({
        hasText: canViewAllRequests
          ? /^Reimbursements$/
          : /^My reimbursements$/,
      })
    ).toBeVisible({ timeout: 15_000 });
    // Reviewers see their queue; everyone else sees their own pending requests.
    await expect(
      labels.filter({ hasText: /^(Waiting for you|My pending)$/ })
    ).toBeVisible();

    if (canViewAllRequests) {
      await expect(labels.filter({ hasText: /^Users$/ })).toBeVisible();
      await expect(
        labels.filter({ hasText: /^Vendor payments$/ })
      ).toBeVisible();
    }
  });

  test("the waiting count matches the review panel", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Reviewer-only test");

    const chip = page
      .locator("[data-slot=stat-chip]")
      .filter({ hasText: "Waiting for you" });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    const waiting = await chip.locator("[data-slot=stat-value]").innerText();

    const panel = page.getByRole("region", { name: "Waiting for review" });
    if (waiting === "0") {
      await expect(panel).toBeHidden();
      return;
    }
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText(waiting, { exact: true }).first()
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /^Review / }).first()
    ).toBeVisible();
  });
});
