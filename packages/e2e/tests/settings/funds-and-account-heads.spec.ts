import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

function listItem(main: ReturnType<Page["locator"]>, name: string) {
  return main
    .locator("[data-slot='settings-list-item']")
    .filter({ hasText: name });
}

/** Opens a select and picks an option, retrying a click that lands before the select is ready. */
async function pickOption(
  page: Page,
  combobox: ReturnType<Page["locator"]>,
  name: string
) {
  const option = page.getByRole("option", { exact: true, name });
  await expect(async () => {
    if (!(await option.isVisible())) {
      await combobox.click();
    }
    await expect(option).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await option.click();
}

async function toggleActive(
  page: Page,
  row: ReturnType<Page["locator"]>,
  name: string,
  label: "Deactivate" | "Reactivate"
) {
  await row.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { exact: true, name: label }).click();
}

test.describe("Funds and account heads settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("adds, edits and deactivates a fund, and keeps the General Fund active", async ({
    page,
  }) => {
    test.slow();
    const main = await openSettingsPage(page, "/settings/funds", "Funds");
    const general = listItem(main, "General Fund");
    await expect(general).toBeVisible({ timeout: 10_000 });
    await general
      .getByRole("button", { name: /^Actions for General Fund/ })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /^Deactivate/ })
    ).toBeDisabled();
    await page.keyboard.press("Escape");

    const stamp = String(Date.now()).slice(-6);
    const name = `E2E Fund ${stamp}`;
    // Added closed, so the income form's fund picker never offers it to
    // specs running alongside.
    await main.getByRole("button", { name: "Add fund" }).click();
    await main.getByRole("textbox", { exact: true, name: "Name" }).fill(name);
    await main.getByLabel("Code").fill(`e2e${stamp}`);
    await pickOption(
      page,
      main.getByRole("combobox", { name: "Restriction" }),
      "Restricted"
    );
    await main.getByRole("switch", { name: "Active" }).click();
    await main.getByRole("button", { name: "Save fund" }).click();
    await expect(page.getByText("Fund added")).toBeVisible();
    const row = listItem(main, name);
    await expect(row).toContainText(`E2E${stamp} · Restricted · Domestic`, {
      timeout: 10_000,
    });
    await expect(row).toContainText("Inactive");

    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await main
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`${name} Edited`);
    await main.getByRole("button", { name: "Save fund" }).click();
    await expect(page.getByText("Fund saved")).toBeVisible();
    const edited = listItem(main, `${name} Edited`);
    await expect(edited).toBeVisible({ timeout: 10_000 });

    await toggleActive(page, edited, `${name} Edited`, "Reactivate");
    await expect(edited).not.toContainText("Inactive", { timeout: 10_000 });
    await toggleActive(page, edited, `${name} Edited`, "Deactivate");
    await expect(edited).toContainText("Inactive", { timeout: 10_000 });
  });

  test("adds, edits and deactivates an account head under a parent", async ({
    page,
  }) => {
    test.slow();
    const main = await openSettingsPage(
      page,
      "/settings/account-heads",
      "Account heads"
    );
    await expect(listItem(main, "Expenses").first()).toBeVisible({
      timeout: 10_000,
    });

    const stamp = String(Date.now()).slice(-6);
    const name = `E2E Head ${stamp}`;
    await main.getByRole("button", { name: "Add account head" }).click();
    await main.getByRole("textbox", { exact: true, name: "Name" }).fill(name);
    await main.getByLabel("Code").fill(`E2E_HEAD_${stamp}`);
    await pickOption(
      page,
      main.getByRole("combobox", { name: "Parent" }),
      "Expenses"
    );
    await main.getByRole("switch", { name: "Active" }).click();
    await main.getByRole("button", { name: "Save account head" }).click();
    await expect(page.getByText("Account head added")).toBeVisible();
    const row = listItem(main, name);
    await expect(row).toContainText(
      `E2E_HEAD_${stamp} · Expense · under Expenses`,
      { timeout: 10_000 }
    );
    await expect(row).toContainText("Inactive");

    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await main.getByLabel("Tally ledger name").fill("E2E Tally");
    await main
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`${name} Edited`);
    await main.getByRole("button", { name: "Save account head" }).click();
    await expect(page.getByText("Account head saved")).toBeVisible();
    const edited = listItem(main, `${name} Edited`);
    await expect(edited).toBeVisible({ timeout: 10_000 });

    // Nothing posts under it, so it can be switched on and off.
    await toggleActive(page, edited, `${name} Edited`, "Reactivate");
    await expect(edited).not.toContainText("Inactive", { timeout: 10_000 });
    await toggleActive(page, edited, `${name} Edited`, "Deactivate");
    await expect(edited).toContainText("Inactive", { timeout: 10_000 });
  });
});
