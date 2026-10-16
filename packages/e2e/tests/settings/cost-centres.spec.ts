import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";
import { SANDBOX_TEAM, openSeededTeam } from "../../helpers/team-event";

function openCostCentres(page: Page) {
  return openSettingsPage(page, "/settings/cost-centres", "Cost centres");
}

function centreRow(main: ReturnType<Page["locator"]>, name: string) {
  return main
    .locator("[data-slot='settings-list-item']")
    .filter({ hasText: name });
}

test.describe("Cost centres settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("lists Bangalore active and Mumbai closed, and keeps the last active one", async ({
    page,
  }) => {
    const main = await openCostCentres(page);

    const bangalore = centreRow(main, "Bangalore");
    await expect(bangalore).toContainText("BLR", { timeout: 10_000 });
    await expect(bangalore).not.toContainText("Inactive");
    await expect(centreRow(main, "Mumbai")).toContainText("Inactive");

    await bangalore
      .getByRole("button", { name: "Actions for Bangalore" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /^Deactivate/ })
    ).toBeDisabled();
  });

  test("adds a closed cost centre, which is offered nowhere", async ({
    page,
    request,
  }) => {
    test.slow();
    const main = await openCostCentres(page);
    const stamp = String(Date.now()).slice(-6);
    const name = `E2E City ${stamp}`;
    const code = `E2E${stamp}`;

    // Added closed, so no second centre is ever active while other specs
    // run (every event and request form would then ask for a city);
    // `cost-centre-activation.spec.ts` covers activating and deactivating
    // on its own, after every other spec.
    await main.getByRole("button", { name: "Add cost centre" }).click();
    await expect(main.getByText("New cost centre")).toBeVisible();
    await main.getByLabel("Name").fill(name);
    await main.getByLabel("Code").fill(code.toLowerCase());
    await main.getByLabel("State or union territory").fill("Goa");
    await main.getByRole("switch", { name: "Active" }).click();
    await main.getByRole("button", { name: "Save cost centre" }).click();
    await expect(page.getByText("Cost centre added")).toBeVisible();
    const row = centreRow(main, name);
    // Saved upper-case: the code is what the website's feed uses.
    await expect(row).toContainText(`${code} · Goa`, { timeout: 10_000 });
    await expect(row).toContainText("Inactive");

    // The code can't change once created.
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(main.getByLabel("Code")).toBeDisabled();
    await expect(main.getByLabel("Code")).toHaveValue(code);
    await main.getByRole("button", { name: "Cancel" }).click();

    // The event form offers no closed city: with one active centre it asks
    // for none.
    await openSeededTeam(page, SANDBOX_TEAM);
    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Programme")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: /^City/ })).toHaveCount(
      0
    );
    await expect(dialog.getByText(name)).toHaveCount(0);

    // Nor does the website's events feed: a code that was never active is
    // refused with the active ones.
    const response = await request.get(`/api/public/events?city=${code}`);
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("BLR");
    expect(body.error).not.toContain(code);
  });

  test("refuses a code already used", async ({ page }) => {
    const main = await openCostCentres(page);

    await main.getByRole("button", { name: "Add cost centre" }).click();
    await main.getByLabel("Name").fill(`E2E Dup ${Date.now()}`);
    await main.getByLabel("Code").fill("BLR");
    await main.getByRole("button", { name: "Save cost centre" }).click();

    await expect(page.getByText("Code BLR is already used")).toBeVisible();
  });
});
