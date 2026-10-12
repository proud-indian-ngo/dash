import type { Page } from "@playwright/test";

import { expect, waitForZeroReady } from "../fixtures/test";

/**
 * Opens a settings page by its address and returns the main region, where
 * the section's content lives.
 */
export async function openSettingsPage(
  page: Page,
  path: string,
  title: string
) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: title })
  ).toBeVisible({ timeout: 15_000 });
  await waitForZeroReady(page);
  return page.locator("#main");
}
