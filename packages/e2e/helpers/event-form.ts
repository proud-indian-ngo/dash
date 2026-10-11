import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Expands the event form's "Advanced settings", where recurrence, feedback and
 * RSVP options live. Safe to call when it is already open.
 */
export async function openAdvancedSettings(dialog: Locator) {
  const trigger = dialog.getByRole("button", { name: "Advanced settings" });
  // A click while the dialog is still opening can be lost, so retry it.
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
}

/**
 * Waits for toasts to close. They sit bottom-right, over the row menus of a
 * table's pinned actions column, and would take the next click. Toasts pause
 * while hovered, so move the pointer off them first.
 */
export async function waitForToastsToClear(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10_000,
  });
}
