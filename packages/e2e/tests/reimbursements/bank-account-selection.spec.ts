import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.slow();

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function navigateToBanking(page: import("@playwright/test").Page) {
  await openSettings(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Banking" }).click();
  await expect(dialog.getByText("Add bank account")).toBeVisible();
  return dialog;
}

/** Locate a bank account card by its last-4 digits within a dialog */
function accountCard(
  dialog: import("@playwright/test").Locator,
  lastFour: string
) {
  return dialog
    .locator(".rounded-md.border")
    .filter({ hasText: `••••${lastFour}` });
}

async function selectBankAccountOption(
  bankAccountGroup: import("@playwright/test").Locator,
  lastFour: string
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await bankAccountGroup.getByRole("combobox").click();
    const option = bankAccountGroup.page().getByRole("option").filter({
      hasText: lastFour,
    });
    await expect(option.first()).toBeVisible({ timeout: 10_000 });
    if (
      await option
        .first()
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await expect(bankAccountGroup.getByRole("combobox")).toContainText(
        lastFour,
        { timeout: 10_000 }
      );
      return;
    }
    await bankAccountGroup
      .page()
      .keyboard.press("Escape")
      .catch(() => {
        // Ignore closed dropdown between retries.
      });
  }

  await bankAccountGroup.getByRole("combobox").click();
  await bankAccountGroup
    .page()
    .getByRole("option")
    .filter({ hasText: lastFour })
    .first()
    .click();
  await expect(bankAccountGroup.getByRole("combobox")).toContainText(lastFour);
}

const ROLES_FOR_BANK_ACCOUNT_FLOW = new Set(["super_admin", "volunteer"]);

test.describe("Bank account selection with duplicate names", () => {
  const SEED_LAST4 = "7890";
  let duplicateLast4 = "";

  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !ROLES_FOR_BANK_ACCOUNT_FLOW.has(testInfo.project.name),
      "Bank account UX covered under super_admin + volunteer projects"
    );
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: delete the duplicate account if it exists
    try {
      // Dismiss any open dialogs first
      await page.keyboard.press("Escape").catch(() => {
        // Ignore — page may have navigated
      });
      await page.waitForTimeout(300);

      const dialog = await navigateToBanking(page);
      const card = accountCard(dialog, duplicateLast4);
      while ((await card.count()) > 0) {
        const seedCard = accountCard(dialog, SEED_LAST4).first();
        const duplicateCard = card.first();
        if (
          (await duplicateCard
            .getByText("Default", { exact: true })
            .isVisible()
            .catch(() => false)) &&
          (await seedCard
            .getByRole("button", { name: "Set default" })
            .isVisible()
            .catch(() => false))
        ) {
          await seedCard.getByRole("button", { name: "Set default" }).click();
          await expect(
            seedCard.getByText("Default", { exact: true })
          ).toBeVisible({ timeout: 10_000 });
        }
        await card
          .first()
          .getByRole("button", { name: "Delete account" })
          .click();
        const confirmBtn = page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Delete" });
        await confirmBtn.click({ timeout: 5000 });
        await expect(card).toHaveCount(0, { timeout: 10_000 });
      }
    } catch {
      // Best-effort cleanup — don't fail the test
    }
  });

  test("selects default account and allows switching between same-named accounts", async ({
    page,
  }) => {
    const duplicateNumber = `98${Date.now().toString().slice(-8)}`;
    duplicateLast4 = duplicateNumber.slice(-4);

    // Step 1: Add a second bank account with the same name via Settings → Banking
    const dialog = await navigateToBanking(page);

    await dialog.getByLabel("Account name").fill("Test Savings");
    await dialog.getByLabel("Account number").fill(duplicateNumber);
    await dialog.getByLabel("IFSC code").fill("TEST0000002");
    await dialog.getByRole("button", { name: "Add account" }).click();

    // Wait for the new account card to appear
    await expect(accountCard(dialog, duplicateLast4)).toBeVisible({
      timeout: 10_000,
    });

    // Step 2: Set the new account as default
    await accountCard(dialog, duplicateLast4)
      .first()
      .getByRole("button", { name: "Set default" })
      .click();

    // Wait for the Default badge to appear on the new account card
    await expect(
      accountCard(dialog, duplicateLast4)
        .first()
        .getByText("Default", { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Close the settings dialog
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Step 3: Open new reimbursement form and verify the default account is selected
    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToNew();

    // The bank account field should show the new default (••••3210)
    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await expect(bankAccountGroup.getByRole("combobox")).toContainText(
      duplicateLast4
    );

    // Step 4: Open the dropdown and switch to the other account
    await selectBankAccountOption(bankAccountGroup, SEED_LAST4);

    // Step 5: Switch back to verify both directions work
    await selectBankAccountOption(bankAccountGroup, duplicateLast4);
  });
});
