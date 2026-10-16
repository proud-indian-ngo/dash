import { expect, test } from "../../fixtures/test";
import { lockBankAccounts } from "../../helpers/bank-account-lock";
import { openSettingsPage } from "../../helpers/settings";

function openBankingSettings(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/bank-accounts", "Bank accounts");
}

/** Generate a unique 10-digit account number to avoid collisions across test runs. */
function uniqueAccountNumber(suffix: string) {
  return String(Date.now()).slice(-7) + suffix.padStart(3, "0");
}

test.describe("Banking settings — bank account management", () => {
  let release: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Banking settings behavior is role-independent; run against isolated user"
    );
    // These tests add accounts and change the default, as does the
    // reimbursement bank-account spec: take turns on the user's accounts.
    release = await lockBankAccounts(testInfo);
  });

  test.afterEach(async ({ page }) => {
    try {
      await cleanUpAccounts(page);
    } finally {
      await release?.();
      release = undefined;
    }
  });

  async function cleanUpAccounts(page: import("@playwright/test").Page) {
    const cleanup = async () => {
      const dialog = await openBankingSettings(page);
      const cleanupOne = async (attempt: number): Promise<void> => {
        if (attempt >= 5) {
          return;
        }
        const e2eCard = dialog
          .locator("[data-slot='settings-list-item']")
          .filter({ hasText: /^E2E / })
          .first();
        if (!(await e2eCard.isVisible({ timeout: 2000 }).catch(() => false))) {
          return;
        }
        const setDefaultBtn = dialog
          .locator("[data-slot='settings-list-item']")
          .filter({ hasText: "••••7890" })
          .getByRole("button", { name: "Set default" });
        if (
          await setDefaultBtn.isVisible({ timeout: 500 }).catch(() => false)
        ) {
          await setDefaultBtn.click();
          // Shown once the server has saved it (the badge is optimistic).
          await expect(page.getByText("Default account set")).toBeVisible({
            timeout: 15_000,
          });
        }
        await e2eCard
          .getByRole("button", { name: "Delete account" })
          .click({ timeout: 5000 });
        const confirm = page.getByRole("alertdialog");
        await confirm
          .getByRole("button", { name: "Delete" })
          .click({ timeout: 5000 });
        // The dialog closes once the server has deleted the account, so
        // releasing the lock afterwards can't race the next test.
        await expect(confirm).toBeHidden({ timeout: 15_000 });
        await cleanupOne(attempt + 1);
      };
      await cleanupOne(0);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        cleanup(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("cleanup timeout")),
            30_000
          );
        }),
      ]);
    } catch (caughtError) {
      console.warn(
        "[afterEach cleanup] failed to delete E2E accounts:",
        caughtError
      );
    } finally {
      clearTimeout(timer);
    }
  }

  test("shows existing seeded bank account", async ({ page }) => {
    const dialog = await openBankingSettings(page);

    // Seeded account ends in 7890. Use first() in case previous runs left extra accounts.
    await expect(dialog.getByText(/••••\d{4}/).first()).toBeVisible({
      timeout: 10_000,
    });
    // exact: true avoids matching "Set default" button (getByText is case-insensitive)
    await expect(dialog.getByText("Default", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
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
