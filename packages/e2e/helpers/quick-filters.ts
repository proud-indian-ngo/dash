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
  const option = page
    .getByRole("checkbox", { exact: true, name: value })
    .or(page.getByRole("radio", { exact: true, name: value }));
  // Toolbar measurement can move a field between its placeholder and More.
  await expect(async () => {
    if (await option.isVisible()) {
      return;
    }
    if (
      await page.getByRole("menu", { exact: true, name: "More" }).isVisible()
    ) {
      await page.keyboard.press("Escape");
    }
    if (await placeholder.isVisible()) {
      await placeholder.click({ timeout: 1000 });
    } else {
      await page
        .getByRole("button", { exact: true, name: "More" })
        .click({ timeout: 1000 });
      await page
        .getByRole("menuitem", { exact: true, name: field })
        .click({ timeout: 1000 });
    }
    await expect(option).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await option.click();
  const popover = page.getByRole("dialog");
  await expect(async () => {
    if (await popover.isVisible()) {
      await page.keyboard.press("Escape");
    }
    await expect(popover).toBeHidden({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}
