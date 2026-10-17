import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";
import { SANDBOX_TEAM, openSeededTeam } from "../../helpers/team-event";

/**
 * Activating a second cost centre makes every event and request form ask
 * for a city, so this spec runs in the `exclusive_last` project: after every
 * other project, with one worker.
 */

function openCostCentres(page: Page) {
  return openSettingsPage(page, "/settings/cost-centres", "Cost centres");
}

async function cityOptionsInEventForm(page: Page) {
  await openSeededTeam(page, SANDBOX_TEAM);
  await page.getByRole("button", { name: "Create event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Programme")).toBeVisible();
  return dialog.getByRole("combobox", { name: /^City/ });
}

test.describe("Cost centre activation (runs last, alone)", () => {
  test("a reactivated centre is offered on the event form until it is deactivated", async ({
    page,
  }) => {
    test.slow();
    const main = await openCostCentres(page);
    const stamp = String(Date.now()).slice(-6);
    const name = `E2E Active ${stamp}`;

    await main.getByRole("button", { name: "Add cost centre" }).click();
    await main.getByLabel("Name").fill(name);
    await main.getByLabel("Code").fill(`E2EA${stamp}`);
    await main.getByRole("switch", { name: "Active" }).click();
    await main.getByRole("button", { name: "Save cost centre" }).click();
    const row = main
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: name });
    await expect(row).toContainText("Inactive", { timeout: 10_000 });

    try {
      await row.getByRole("button", { name: `Actions for ${name}` }).click();
      await page.getByRole("menuitem", { name: "Reactivate" }).click();
      await expect(page.getByText(`${name} reactivated`)).toBeVisible();

      // Two active centres: the event form asks, offering both.
      const city = await cityOptionsInEventForm(page);
      await expect(city).toBeVisible();
      await city.click();
      await expect(page.getByRole("option", { name })).toBeVisible();
      await expect(
        page.getByRole("option", { exact: true, name: "Bangalore" })
      ).toBeVisible();
      await expect(
        page.getByRole("option", { exact: true, name: "Mumbai" })
      ).toHaveCount(0);
    } finally {
      const settings = await openCostCentres(page);
      const again = settings
        .locator("[data-slot='settings-list-item']")
        .filter({ hasText: name });
      if (!(await again.textContent())?.includes("Inactive")) {
        await again
          .getByRole("button", { name: `Actions for ${name}` })
          .click();
        await page.getByRole("menuitem", { name: "Deactivate" }).click();
        await expect(page.getByText(`${name} deactivated`)).toBeVisible();
      }
      await expect(again).toContainText("Inactive");
    }

    // Deactivated: one active centre again, so the form asks for none.
    await expect(await cityOptionsInEventForm(page)).toHaveCount(0);
  });
});
