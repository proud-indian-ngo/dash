import { expect, test, waitForZeroReady } from "../../fixtures/test";

async function openNotificationSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Notifications" }).click();
  await expect(
    dialog.getByText("Choose which notifications you want to receive.")
  ).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe("Notification preferences settings", () => {
  test("shows notification topic toggles with email and WhatsApp switches", async ({
    page,
  }) => {
    const dialog = await openNotificationSettings(page);

    // Each topic has at least one WhatsApp switch
    const waSwitch = dialog.getByRole("switch", { name: /WhatsApp/i }).first();
    await expect(waSwitch).toBeVisible({ timeout: 10_000 });

    // And at least one email switch
    const emailSwitch = dialog.getByRole("switch", { name: /Email/i }).first();
    await expect(emailSwitch).toBeVisible();
  });

  test("toggling a switch updates the preference state", async ({ page }) => {
    const dialog = await openNotificationSettings(page);

    // Find the first non-disabled WhatsApp switch (required topics are aria-disabled)
    const allWaSwitches = dialog.getByRole("switch", { name: /WhatsApp/i });
    await expect(allWaSwitches.first()).toBeVisible({ timeout: 10_000 });

    const count = await allWaSwitches.count();
    let firstWaSwitch = allWaSwitches.first();
    for (let i = 0; i < count; i++) {
      const sw = allWaSwitches.nth(i);
      const disabled = await sw.getAttribute("aria-disabled");
      if (disabled !== "true") {
        firstWaSwitch = sw;
        break;
      }
    }

    const wasChecked = await firstWaSwitch.isChecked();

    // Toggle it
    await firstWaSwitch.click();

    // Verify it changed
    if (wasChecked) {
      await expect(firstWaSwitch).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(firstWaSwitch).toBeChecked({ timeout: 5000 });
    }

    // Toast confirming update
    await expect(page.getByText(/Notification (enabled|disabled)/)).toBeVisible(
      { timeout: 5000 }
    );

    // Toggle back to original state
    await firstWaSwitch.click();
    if (wasChecked) {
      await expect(firstWaSwitch).toBeChecked({ timeout: 5000 });
    } else {
      await expect(firstWaSwitch).not.toBeChecked({ timeout: 5000 });
    }
  });
});
