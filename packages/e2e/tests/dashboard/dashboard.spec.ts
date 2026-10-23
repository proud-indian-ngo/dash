import { expect, test } from "../../fixtures/test";

const ROLES_WITH_VIEW_ALL = new Set(["super_admin", "admin", "finance_admin"]);

test.describe("Dashboard", () => {
  test("shows the heading, New reimbursement and role stat chips", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
    // Unoriented volunteers see the orientation prompt instead.
    if (testInfo.project.name === "unoriented_volunteer") {
      return;
    }

    await expect(
      page.getByRole("button", { name: "New reimbursement" })
    ).toBeVisible();

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
    await page.goto("/");

    const chip = page
      .locator("[data-slot=stat-chip]")
      .filter({ hasText: "Waiting for you" });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    const chipValue = chip.locator("[data-slot=stat-value]");
    await expect(chipValue).toHaveText(/^\d+$/);
    const waiting = await chipValue.innerText();

    const panel = page.getByRole("region", { name: "Waiting for review" });
    await expect(panel).toBeVisible();
    await expect(
      panel.locator('[data-slot="card-title"] [data-slot="tag"]')
    ).toHaveText(waiting);
    if (waiting !== "0") {
      await expect(
        panel.getByRole("link", { name: /^Review / }).first()
      ).toBeVisible();
    }
  });
});
