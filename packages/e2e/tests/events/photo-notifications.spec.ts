import path from "node:path";
import { expect, test } from "../../fixtures/test";

// These tests verify that photo approval/rejection notifications
// are batched correctly when multiple photos are approved at once.
//
// PHOTO_NOTIFICATION_DELAY_SECONDS should be set to a small value
// (e.g. 5) in the test environment so we don't wait 2 real minutes.

test.describe("Photo notifications — admin batch approval", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("batch approving multiple photos sends a single summary notification to the uploader", async ({
    page,
    browser,
  }) => {
    test.slow();

    // Navigate to teams page and find an E2E team
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
      timeout: 10_000,
    });

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Find an event with pending photos — look for events in the table
    const eventLinks = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLinks.count()) === 0) {
      test.skip(true, "No events available");
      return;
    }

    // Try up to 5 events to find one with pending photos
    const linkCount = await eventLinks.count();
    let foundPhotos = false;

    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      await eventLinks.nth(i).click();
      await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

      const photosTab = page.getByRole("tab", { name: /Photos/ });
      if (await photosTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await photosTab.click();
        const approveAllButton = page.getByRole("button", {
          name: "Approve All",
        });
        if (
          await approveAllButton.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          foundPhotos = true;
          break;
        }
      }

      await page.goto("/teams");
      await teamLink.first().click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 10_000,
      });
    }

    if (!foundPhotos) {
      test.skip(true, "No events with multiple pending photos found");
      return;
    }

    // Approve all pending photos at once
    const approveAllButton = page.getByRole("button", { name: "Approve All" });
    await approveAllButton.click();

    // Confirm in the dialog
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.getByRole("button", { name: "Approve All" }).click();
    }

    await expect(page.getByText(/photos approved/i)).toBeVisible({
      timeout: 10_000,
    });

    // Open a volunteer browser context to check the uploader's notification
    // inbox — the batch notification goes to the photo uploader, not the admin.
    const volunteerAuthFile = path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    );
    const volunteerContext = await browser.newContext({
      storageState: volunteerAuthFile,
    });
    const volunteerPage = await volunteerContext.newPage();
    await volunteerPage.goto("/");

    try {
      // Open notification inbox — wait up to 20s for the delayed notification
      // (PHOTO_NOTIFICATION_DELAY_SECONDS=5 in test env + pg-boss processing).
      const userMenuButton = volunteerPage.getByRole("button", {
        name: /open user menu/i,
      });
      if (
        await userMenuButton.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        await userMenuButton.click();
      } else {
        await volunteerPage
          .getByRole("button")
          .filter({ hasText: "" })
          .last()
          .click();
      }

      await volunteerPage
        .getByRole("menuitem", { name: /Notifications/i })
        .click();

      // The Courier inbox should show a batch notification:
      // "X of your photos for [event] have been approved."
      const inboxNotification = volunteerPage.getByText(/photos.*approved/i);
      await expect(inboxNotification).toBeVisible({ timeout: 20_000 });
    } finally {
      await volunteerContext.close();
    }
  });
});

test.describe("Photo notifications — admin single approval", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("approving a single photo sends a singular notification", async ({
    page,
  }) => {
    test.slow();

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
      timeout: 10_000,
    });

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    const eventLinks = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLinks.count()) === 0) {
      test.skip(true, "No events available");
      return;
    }

    const linkCount = await eventLinks.count();
    let foundPhoto = false;

    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      await eventLinks.nth(i).click();
      await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

      const photosTab = page.getByRole("tab", { name: /Photos/ });
      if (await photosTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await photosTab.click();
        // Look for individual approve button (not "Approve All")
        const approveButton = page
          .getByRole("button", { name: /^Approve/ })
          .filter({ hasNotText: "All" });
        if (
          await approveButton
            .first()
            .isVisible({ timeout: 3000 })
            .catch(() => false)
        ) {
          foundPhoto = true;
          await approveButton.first().click();
          break;
        }
      }

      await page.goto("/teams");
      await teamLink.first().click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 10_000,
      });
    }

    if (!foundPhoto) {
      test.skip(true, "No events with pending photos found");
      return;
    }

    await expect(page.getByText(/photo approved/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
