import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

function openNotificationSettings(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/notifications", "Notifications");
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
      dialog.getByRole("checkbox", { name: "Kalakriti Registration in-app" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Registration WhatsApp" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Schedule in-app" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Schedule WhatsApp" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Registration email" })
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Schedule email" })
    ).toHaveCount(0);
  });

  test("shows notification topic toggles with in-app, email, and WhatsApp switches", async ({
    page,
  }) => {
    const dialog = await openNotificationSettings(page);

    // Each topic has at least one in-app switch
    const inAppBox = dialog.getByRole("checkbox", { name: /in-app/i }).first();
    await expect(inAppBox).toBeVisible({ timeout: 10_000 });

    // And at least one email switch
    const emailBox = dialog.getByRole("checkbox", { name: /email/i }).first();
    await expect(emailBox).toBeVisible();

    // And at least one WhatsApp switch
    const waBox = dialog.getByRole("checkbox", { name: /WhatsApp/i }).first();
    await expect(waBox).toBeVisible();
  });

  test("toggling a switch updates the preference state", async ({ page }) => {
    const dialog = await openNotificationSettings(page);

    // Find the first non-disabled WhatsApp switch (required topics are aria-disabled)
    const allWaBoxes = dialog.getByRole("checkbox", { name: /WhatsApp/i });
    await expect(allWaBoxes.first()).toBeVisible({ timeout: 10_000 });

    const count = await allWaBoxes.count();
    const disabledStates = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        allWaBoxes.nth(i).getAttribute("aria-disabled")
      )
    );
    const firstEnabledIndex = disabledStates.findIndex(
      (disabled) => disabled !== "true"
    );
    const firstWaSwitch =
      firstEnabledIndex === -1
        ? allWaBoxes.first()
        : allWaBoxes.nth(firstEnabledIndex);

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
    await expect(page.getByText(/Notification turned (on|off)/)).toBeVisible({
      timeout: 5000,
    });

    // Toggle back to original state
    await firstWaSwitch.click();
    if (wasChecked) {
      await expect(firstWaSwitch).toBeChecked({ timeout: 5000 });
    } else {
      await expect(firstWaSwitch).not.toBeChecked({ timeout: 5000 });
    }
  });
});
