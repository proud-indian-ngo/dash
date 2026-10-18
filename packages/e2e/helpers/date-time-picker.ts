import { expect, type Locator } from "@playwright/test";

/**
 * Picks a day in a form's date-time field (a button that opens a calendar).
 * The time keeps the picker's default; tests here only need past or future.
 */
export async function pickDate(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  // The topmost dialog: the popover, or on phones the picker drawer (which
  // makes the drawer it opened from inert, so dialogs are not counted).
  const popup = page.getByRole("dialog").last();
  await expect(popup.getByRole("grid").first()).toBeVisible();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  // Date-time pickers stay open for the time; plain date pickers close.
  if (await day.isVisible()) {
    await page.keyboard.press("Escape");
  }
  await expect(day).toBeHidden();
}
