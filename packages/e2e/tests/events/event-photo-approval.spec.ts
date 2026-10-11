import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSeededTeamEvent } from "../../helpers/team-event";

const EVENT_NAME = "E2E Past Event With Pending Photos";
/** The Undo window plus a margin, so the delayed save has run. */
const SAVE_WAIT_MS = 6000;

async function openPhotos(page: Page) {
  await page.getByRole("tab", { name: /Photos/ }).click();
}

const pendingHeading = (page: Page, count: number) =>
  page.getByText(`Pending Approval (${count})`, { exact: true });

test.describe("Event photo approval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("approves one photo, then the rest with Approve All, each with Undo", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeamEvent(page, EVENT_NAME);
    await openPhotos(page);
    await expect(pendingHeading(page, 3)).toBeVisible({ timeout: 10_000 });

    // One photo: Undo puts it back, then approve it for real
    const approveOne = page.getByRole("button", {
      exact: true,
      name: "Approve",
    });
    await approveOne.first().click();
    await expect(page.getByText("Media approved")).toBeVisible();
    await expect(pendingHeading(page, 2)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(pendingHeading(page, 3)).toBeVisible();

    await approveOne.first().click();
    await expect(pendingHeading(page, 2)).toBeVisible();
    await page.waitForTimeout(SAVE_WAIT_MS);
    await page.reload();
    await openPhotos(page);
    await expect(pendingHeading(page, 2)).toBeVisible({ timeout: 10_000 });

    // Approve All: Undo restores every photo, then approve them for real
    const approveAll = page.getByRole("button", { name: "Approve All" });
    await approveAll.click();
    await expect(page.getByText("2 media items approved")).toBeVisible();
    await expect(approveAll).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(pendingHeading(page, 2)).toBeVisible();

    await approveAll.click();
    await expect(approveAll).toBeHidden();
    await page.waitForTimeout(SAVE_WAIT_MS);
    await page.reload();
    await openPhotos(page);
    await expect(page.getByRole("tab", { name: /Photos/ })).toContainText(
      "(3)",
      { timeout: 10_000 }
    );
    await expect(approveAll).toHaveCount(0);
  });
});
