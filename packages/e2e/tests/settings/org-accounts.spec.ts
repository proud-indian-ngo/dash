// @e2e-areas income
import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { openSettingsPage } from "../../helpers/settings";
import { ListPage } from "../../pages/list-page";

const SPONSOR = "E2E Income Sponsor";

async function pickOption(
  scope: Locator,
  page: Page,
  label: string,
  text: string
) {
  const combobox = scope.getByRole("combobox", { name: label });
  await combobox.click();
  await combobox.fill(text);
  const option = page.getByRole("option").filter({ hasText: text }).first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

test.describe("Organisation accounts settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("creates an account, deposits a sponsor's contribution into it, then deactivates it", async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const name = `E2E FCRA Account ${stamp}`;
    const reference = `E2E-ACC-${stamp}`;

    const main = await openSettingsPage(
      page,
      "/settings/org-accounts",
      "Organisation accounts"
    );
    await main.getByRole("button", { name: "Add account" }).click();
    await expect(main.getByText("New account")).toBeVisible();
    await main.getByRole("textbox", { exact: true, name: "Name" }).fill(name);
    // The FCRA role only appears for FCRA money.
    await expect(main.getByLabel("FCRA role")).toHaveCount(0);
    await main.getByLabel("Fund source").click();
    await page.getByRole("option", { exact: true, name: "FCRA" }).click();
    await main.getByLabel("FCRA role").click();
    await page
      .getByRole("option", { exact: true, name: "FCRA receipt" })
      .click();
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Account created")).toBeVisible();
    const row = main
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("Bank · FCRA · FCRA receipt");

    // Record a sponsor's contribution into the new account.
    await page.goto("/income");
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Record contribution" }).click();
    const dialog = page.getByRole("dialog", { name: "Record contribution" });
    await expect(dialog).toBeVisible();
    await pickOption(dialog, page, "Donor", SPONSOR);
    await expect(dialog.getByRole("combobox", { name: "Donor" })).toHaveValue(
      `${SPONSOR} (Sponsor)`
    );
    await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill("5000");
    await pickOption(dialog, page, "Deposited into", name);
    await dialog
      .getByRole("textbox", { exact: true, name: "Reference" })
      .fill(reference);
    await clickUntilDialogCloses(dialog, "Save contribution");

    await page.getByPlaceholder("Search donor or reference...").fill(reference);
    const gift = page.getByRole("row").filter({ hasText: SPONSOR });
    await expect(gift).toHaveCount(1, { timeout: 10_000 });
    await gift.click();
    const sheet = page.getByRole("dialog").filter({ hasText: reference });
    await expect(sheet).toContainText(name, { timeout: 10_000 });
    await page.keyboard.press("Escape");

    // Deactivate: the account stays on the record but leaves the picker.
    const settings = await openSettingsPage(
      page,
      "/settings/org-accounts",
      "Organisation accounts"
    );
    const accountRow = settings
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: name });
    await accountRow
      .getByRole("button", { name: `Actions for ${name}` })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(
      settings.getByRole("textbox", { exact: true, name: "Name" })
    ).toHaveValue(name, { timeout: 5000 });
    await settings.getByRole("switch", { name: "Active" }).click();
    await settings.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Account updated")).toBeVisible();
    await expect(accountRow).toContainText("Inactive", { timeout: 10_000 });

    // Editing the gift still names the retired account, marked inactive.
    await page.goto("/income");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donor or reference...").fill(reference);
    const editedGift = page.getByRole("row").filter({ hasText: SPONSOR });
    await expect(editedGift).toHaveCount(1, { timeout: 10_000 });
    await new ListPage(page).openRowActionAndClick(editedGift, "Edit");
    const edit = page.getByRole("dialog", { name: "Edit contribution" });
    await expect(edit).toBeVisible();
    await expect(
      edit.getByRole("combobox", { name: "Deposited into" })
    ).toHaveValue(`${name} (inactive)`, { timeout: 10_000 });
    await edit.getByRole("button", { name: "Cancel" }).click();
    await expect(edit).toBeHidden();

    await page.getByRole("button", { name: "Record contribution" }).click();
    const next = page.getByRole("dialog", { name: "Record contribution" });
    const account = next.getByRole("combobox", { name: "Deposited into" });
    await account.click();
    await account.fill(name);
    await expect(
      page.getByRole("option").filter({ hasText: name })
    ).toHaveCount(0);
  });
});
