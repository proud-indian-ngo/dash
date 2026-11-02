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
    // The seed's protected interest request stays pending, so the queue is
    // never empty.
    await expect(chipValue).toHaveText(/^[1-9]\d*$/);
    const waiting = await chipValue.innerText();

    const panel = page.getByRole("region", { name: "Waiting for review" });
    await expect(panel).toBeVisible();
    await expect(
      panel.locator('[data-slot="card-title"] [data-slot="tag"]')
    ).toHaveText(waiting);
  });

  test("interest requests across events expand to one link per event", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Reviewer-only test");
    await page.goto("/");

    // The protected fixture and the unoriented volunteer's request stay
    // pending on two different events.
    const panel = page.getByRole("region", { name: "Waiting for review" });
    const trigger = panel.getByRole("button", {
      name: "Choose an event to review interest requests",
    });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const links = panel.getByRole("link", {
      name: /^Review interest requests for /,
    });
    await expect.poll(() => links.count()).toBeGreaterThanOrEqual(2);

    const pendingLink = panel.getByRole("link", {
      name: "Review interest requests for E2E Upcoming Event With Pending Interests",
    });
    await pendingLink.click();
    await expect(page).toHaveURL(/\/events\/[^/?]+/);
    await expect(
      page.getByRole("heading", {
        name: "E2E Upcoming Event With Pending Interests",
      })
    ).toBeVisible();
  });
});
