import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSeededTeamEvent } from "../../helpers/team-event";

const EVENT_NAME = "E2E Past Event With Pending Photos";
// The approval spec may approve this photo first; a lead captions it either way.
const CAPTION = "E2E pending photo 3";

async function setCaption(page: Page, from: string, to: string) {
  const card = page
    .locator("div.group")
    .filter({ has: page.getByRole("img", { exact: true, name: from }) });
  await card.hover();
  await card.getByRole("button", { name: "Edit caption" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit caption" });
  const field = dialog.getByLabel("Caption");
  await expect(field).toHaveValue(from);
  await field.fill(to);
  await dialog.getByRole("button", { name: "Save caption" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(
    page.getByRole("img", { exact: true, name: to }).first()
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("Event photo captions (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("edits a photo's caption, then puts it back", async ({ page }) => {
    test.slow();
    await openSeededTeamEvent(page, EVENT_NAME);
    await page.getByRole("tab", { name: /Photos/ }).click();

    const edited = `${CAPTION} edited`;
    await setCaption(page, CAPTION, edited);
    await page.reload();
    await page.getByRole("tab", { name: /Photos/ }).click();
    await setCaption(page, edited, CAPTION);
  });
});
