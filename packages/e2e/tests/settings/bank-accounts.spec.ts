import { expect, test, waitForZeroReady } from "../../fixtures/test";

async function openBankingSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Banking" }).click();
  await expect(dialog.getByRole("link", { name: "Banking" })).toBeVisible();
  return dialog;
}

/** Generate a unique 10-digit account number to avoid collisions across test runs. */
function uniqueAccountNumber(suffix: string) {
  return String(Date.now()).slice(-7) + suffix.padStart(3, "0");
}

test.describe("Banking settings — bank account management", () => {
  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: restore default to seeded "Test Savings" and delete E2E accounts
    try {
      const dialog = await openBankingSettings(page);
      // Restore seeded account as default if it was changed.
      // Use masked number ••••7890 (not name "Test Savings") to uniquely identify the
      // seeded account — bank-account-selection.spec.ts also adds a "Test Savings" account.
      const seededCard = dialog
        .locator(".rounded-md.border")
        .filter({ hasText: "••••7890" });
      const restoreBtn = seededCard.getByRole("button", {
        name: "Set default",
      });
      if (await restoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await restoreBtn.click();
        await expect(
          seededCard.getByText("Default", { exact: true })
        ).toBeVisible({
          timeout: 10_000,
        });
      }
      // Delete all E2E test accounts
      for (let i = 0; i < 5; i++) {
        const e2eCard = dialog
          .locator(".rounded-md.border")
          .filter({ hasText: /^E2E / })
          .first();
        if (!(await e2eCard.isVisible({ timeout: 1000 }).catch(() => false))) {
          break;
        }
        await e2eCard.getByRole("button", { name: "Delete account" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Delete" })
          .click({ timeout: 5000 });
        await expect(e2eCard).toBeHidden({ timeout: 10_000 });
      }
    } catch {
      // Best-effort — don't fail the test
    }
  });

  test("shows existing seeded bank account", async ({ page }) => {
    const dialog = await openBankingSettings(page);

    // Seeded account ends in 7890. Use first() in case previous runs left extra accounts.
    await expect(dialog.getByText(/••••\d{4}/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.getByText("Default")).toBeVisible({ timeout: 10_000 });
  });

  test("adds a new bank account", async ({ page }) => {
    const dialog = await openBankingSettings(page);
    const accountName = `E2E Account ${Date.now()}`;

    await dialog.getByLabel("Account name").fill(accountName);
    await dialog.getByLabel("Account number").fill(uniqueAccountNumber("001"));
    await dialog.getByLabel("IFSC code").fill("TEST0000001");
    await dialog.getByRole("button", { name: "Add account" }).click();

    await expect(page.getByText("Bank account added")).toBeVisible();
    await expect(dialog.getByText(accountName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("sets a bank account as default", async ({ page }) => {
    test.slow();
    const dialog = await openBankingSettings(page);
    const accountName = `E2E Default ${Date.now()}`;

    // Add a second account
    await dialog.getByLabel("Account name").fill(accountName);
    await dialog.getByLabel("Account number").fill(uniqueAccountNumber("002"));
    await dialog.getByLabel("IFSC code").fill("TEST0000002");
    await dialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Bank account added")).toBeVisible();
    await expect(dialog.getByText(accountName)).toBeVisible({
      timeout: 10_000,
    });

    // Set the new account as default
    const newAccountRow = dialog
      .locator(".rounded-md.border")
      .filter({ hasText: accountName });
    await newAccountRow.getByRole("button", { name: "Set default" }).click();

    // New account should show "Default" badge
    await expect(
      newAccountRow
        .locator('[data-slot="badge"]')
        .getByText("Default", { exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("deletes a non-default bank account", async ({ page }) => {
    test.slow();
    const dialog = await openBankingSettings(page);
    const accountName = `E2E Delete ${Date.now()}`;

    // Add an account to delete
    await dialog.getByLabel("Account name").fill(accountName);
    await dialog.getByLabel("Account number").fill(uniqueAccountNumber("003"));
    await dialog.getByLabel("IFSC code").fill("TEST0000003");
    await dialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Bank account added")).toBeVisible();
    await expect(dialog.getByText(accountName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete the new (non-default) account
    const accountRow = dialog
      .locator(".rounded-md.border")
      .filter({ hasText: accountName });
    await accountRow.getByRole("button", { name: "Delete account" }).click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Delete bank account?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    await expect(dialog.getByText(accountName)).toBeHidden({ timeout: 10_000 });
  });
});
