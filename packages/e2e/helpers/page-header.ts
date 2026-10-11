import type { Locator, Page } from "@playwright/test";

/** The ⋯ button in a page header that holds secondary and destructive actions. */
export function pageActionsButton(page: Page): Locator {
  return page.getByRole("button", { name: "More actions" });
}

/** Opens the page header's ⋯ menu and returns the named item. */
export async function openPageAction(
  page: Page,
  name: string
): Promise<Locator> {
  await pageActionsButton(page).click();
  return page.getByRole("menuitem", { name });
}

/** Opens the page header's ⋯ menu and chooses the named item. */
export async function clickPageAction(page: Page, name: string): Promise<void> {
  await (await openPageAction(page, name)).click();
}
