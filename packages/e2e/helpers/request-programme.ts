import type { Page } from "@playwright/test";

import { expect } from "../fixtures/test";

/** Picks a programme in the request form's searchable Programme field. */
export async function selectRequestProgramme(
  page: Page,
  name = "Education"
): Promise<void> {
  const input = page.getByRole("combobox", { name: "Programme" });
  await input.click();
  await input.fill(name);
  await page.getByRole("option", { exact: true, name }).click();
  await expect(input).toHaveValue(name);
}
