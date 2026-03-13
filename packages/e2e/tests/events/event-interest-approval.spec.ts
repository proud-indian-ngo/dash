import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures/test";

async function navigateToEventWithPendingInterest(
  page: Page
): Promise<boolean> {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
    timeout: 10_000,
  });

  const eventLink = page
    .getByRole("table")
    .getByRole("link")
    .filter({ hasText: /.+/ });
  if ((await eventLink.count()) === 0) {
    return false;
  }

  const linkCount = await eventLink.count();

  for (let i = 0; i < Math.min(linkCount, 5); i++) {
    await eventLink.nth(i).click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    const interestHeading = page.getByText(/Interest Requests \(\d+\)/);
    if (await interestHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      return true;
    }

    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
      timeout: 10_000,
    });
  }

  return false;
}

test.describe("Event interest approval (admin)", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin approves a pending interest request", async ({ page }) => {
    test.slow();

    const found = await navigateToEventWithPendingInterest(page);
    if (!found) {
      test.skip(
        true,
        "No events with pending interest requests — run volunteer interest tests first"
      );
      return;
    }

    const approveButton = page.getByRole("button", {
      name: /^Approve /,
    });
    await expect(approveButton.first()).toBeVisible();
    await approveButton.first().click();

    await expect(page.getByText("Interest approved")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin rejects a pending interest request", async ({ page }) => {
    test.slow();

    const found = await navigateToEventWithPendingInterest(page);
    if (!found) {
      test.skip(true, "No events with pending interest requests");
      return;
    }

    const rejectButton = page.getByRole("button", {
      name: /^Reject /,
    });
    await expect(rejectButton.first()).toBeVisible();
    await rejectButton.first().click();

    await expect(page.getByText("Interest rejected")).toBeVisible({
      timeout: 10_000,
    });
  });
});
