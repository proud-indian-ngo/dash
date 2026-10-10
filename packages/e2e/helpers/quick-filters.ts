import { expect, type Page } from "@playwright/test";

/**
 * Filters a data table through the quick filter toolbar: opens the field's
 * placeholder (or picks it from More), ticks the value, and closes the popover.
 */
export async function applyQuickFilter(
  page: Page,
  field: string,
  value: string
) {
  const placeholder = page.getByRole("button", {
    exact: true,
    name: `Filter by ${field}`,
  });
  if (await placeholder.isVisible()) {
    await placeholder.click();
  } else {
    await page.getByRole("button", { exact: true, name: "More" }).click();
    await page.getByRole("menuitem", { exact: true, name: field }).click();
  }
  await page
    .getByRole("checkbox", { exact: true, name: value })
    .or(page.getByRole("radio", { exact: true, name: value }))
    .click();
  const popover = page.getByRole("dialog");
  await expect(async () => {
    if (await popover.isVisible()) {
      await page.keyboard.press("Escape");
    }
    await expect(popover).toBeHidden({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}
