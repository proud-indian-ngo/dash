import { expect, type Locator } from "@playwright/test";

/**
 * Picks a day in a form's date-time field (a button that opens a calendar).
 * The time keeps the picker's default; tests here only need past or future.
 */
export async function pickDate(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  const dialogs = page.getByRole("dialog");
  const openBefore = await dialogs.count();
  await scope.getByRole("button", { exact: true, name: label }).click();
  await expect(dialogs).toHaveCount(openBefore + 1);
  const popup = page.getByRole("dialog").last();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  await page.keyboard.press("Escape");
  await expect(dialogs).toHaveCount(openBefore);
}
