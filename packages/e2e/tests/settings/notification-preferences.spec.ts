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
  test("shows Kalakriti Registration and Schedule with only supported channels", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "unoriented_volunteer",
      "This role does not have Kalakriti access"
    );
    const dialog = await openNotificationSettings(page);

    await expect(dialog.getByText("Kalakriti", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Registration in-app" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Registration WhatsApp" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Schedule in-app" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Schedule WhatsApp" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Registration email" })
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("switch", { name: "Kalakriti Schedule email" })
    ).toHaveCount(0);
  });

  test("shows notification topic toggles with in-app, email, and WhatsApp switches", async ({
    page,
  }) => {
    const dialog = await openNotificationSettings(page);

    // Each topic has at least one in-app switch
    const inAppSwitch = dialog.getByRole("switch", { name: /in-app/i }).first();
    await expect(inAppSwitch).toBeVisible({ timeout: 10_000 });

    // And at least one email switch
    const emailSwitch = dialog.getByRole("switch", { name: /email/i }).first();
    await expect(emailSwitch).toBeVisible();

    // And at least one WhatsApp switch
    const waSwitch = dialog.getByRole("switch", { name: /WhatsApp/i }).first();
    await expect(waSwitch).toBeVisible();
  });

  test("toggling a switch updates the preference state", async ({ page }) => {
    const dialog = await openNotificationSettings(page);

    // Find the first non-disabled WhatsApp switch (required topics are aria-disabled)
    const allWaSwitches = dialog.getByRole("switch", { name: /WhatsApp/i });
    await expect(allWaSwitches.first()).toBeVisible({ timeout: 10_000 });

    const count = await allWaSwitches.count();
    const disabledStates = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        allWaSwitches.nth(i).getAttribute("aria-disabled")
      )
    );
    const firstEnabledIndex = disabledStates.findIndex(
      (disabled) => disabled !== "true"
    );
    const firstWaSwitch =
      firstEnabledIndex === -1
        ? allWaSwitches.first()
        : allWaSwitches.nth(firstEnabledIndex);

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
