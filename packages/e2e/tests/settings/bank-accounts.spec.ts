import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { lockBankAccounts } from "../../helpers/bank-account-lock";
import { openSettingsPage } from "../../helpers/settings";

const execFileAsync = promisify(execFile);

function openBankingSettings(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/bank-accounts", "Bank accounts");
}

/** Removes every account but the seeded one and makes it the default. */
async function resetAccounts(email: string) {
  await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/bank-accounts-reset.ts"),
      email,
    ],
    { env: process.env }
  );
}

/** Generate a unique 10-digit account number to avoid collisions across test runs. */
function uniqueAccountNumber(suffix: string) {
  return String(Date.now()).slice(-7) + suffix.padStart(3, "0");
}

test.describe("Banking settings — bank account management", () => {
  let release: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ unorientedVolunteerEmail }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Banking settings behavior is role-independent; run against isolated user"
    );
    // These tests add accounts and change the default, as does the
    // reimbursement bank-account spec: take turns on the user's accounts,
    // and start each test from the seeded account alone.
    release = await lockBankAccounts(testInfo);
    await resetAccounts(unorientedVolunteerEmail);
  });

  test.afterEach(async ({ unorientedVolunteerEmail }) => {
    try {
      await resetAccounts(unorientedVolunteerEmail);
    } finally {
      await release?.();
      release = undefined;
    }
  });

  test("shows existing seeded bank account", async ({ page }) => {
    const dialog = await openBankingSettings(page);

    const accounts = dialog.locator("[data-slot='settings-list-item']");
    await expect(accounts).toHaveCount(1, { timeout: 10_000 });
    await expect(accounts.getByText(/••••7890/)).toBeVisible();
    await expect(
      accounts.locator('[data-slot="tag"]').getByText("Default", {
        exact: true,
      })
    ).toBeVisible();
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

  test("adds a UPI ID alongside or instead of a bank account", async ({
    page,
  }) => {
    const dialog = await openBankingSettings(page);
    const upiName = `E2E UPI ${Date.now()}`;
    const handle = `e2e.${Date.now()}@okhdfc`;

    // Neither bank details nor UPI: refused.
    await dialog.getByLabel("Account name").fill(upiName);
    await dialog.getByLabel("Account number").focus();
    await dialog.getByLabel("Account number").blur();
    await expect(
      dialog.getByText("Add bank details, a UPI ID or number, or both")
    ).toBeVisible();

    const handleInput = dialog.getByLabel("UPI ID or mobile number");
    await handleInput.fill("not a upi id");
    await handleInput.blur();
    await expect(
      dialog.getByText("Enter a UPI ID (e.g. name@okhdfc)", { exact: false })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add account" })
    ).toBeDisabled();

    // UPI alone.
    await handleInput.fill(handle);
    await dialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("UPI added")).toBeVisible();
    const upiRow = dialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: upiName });
    await expect(upiRow.getByText(`UPI ${handle}`)).toBeVisible({
      timeout: 10_000,
    });

    // Both on one account.
    const bothName = `E2E Both ${Date.now()}`;
    const bothNumber = uniqueAccountNumber("004");
    await dialog.getByLabel("Account name").fill(bothName);
    await dialog.getByLabel("Account number").fill(bothNumber);
    await dialog.getByLabel("IFSC code").fill("TEST0000004");
    const mobile = `9${String(Date.now()).slice(-9)}`;
    await handleInput.fill(`+91 ${mobile}`);
    await dialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Bank account and UPI added")).toBeVisible();
    const bothRow = dialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: bothName });
    await expect(
      bothRow.getByText(
        `••••${bothNumber.slice(-4)} · TEST0000004 · UPI ${mobile}`
      )
    ).toBeVisible({ timeout: 10_000 });

    // The same UPI ID can't be saved twice.
    await dialog.getByLabel("Account name").fill(`E2E Dup ${Date.now()}`);
    await handleInput.fill(handle.toUpperCase());
    await handleInput.blur();
    await expect(
      dialog.getByText("This UPI ID or number is already saved")
    ).toBeVisible();
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
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: accountName });
    await newAccountRow.getByRole("button", { name: "Set default" }).click();

    // New account should show "Default" badge
    await expect(
      newAccountRow
        .locator('[data-slot="tag"]')
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
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: accountName });
    await accountRow.getByRole("button", { name: "Delete account" }).click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Delete account?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    await expect(dialog.getByText(accountName)).toBeHidden({ timeout: 10_000 });
  });
});
