import { randomInt } from "node:crypto";

import { expect, test } from "../../fixtures/test";
import { lockBankAccounts } from "../../helpers/bank-account-lock";
import { chargeRequestTo } from "../../helpers/request-event";
import { openSettingsPage } from "../../helpers/settings";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.slow();

function navigateToBanking(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/bank-accounts", "Bank accounts");
}

/** Locate a bank account row by its last-4 digits */
function accountCard(
  dialog: import("@playwright/test").Locator,
  lastFour: string
) {
  return dialog
    .locator("[data-slot='settings-list-item']")
    .filter({ hasText: `••••${lastFour}` });
}

async function selectBankAccountOption(
  bankAccountGroup: import("@playwright/test").Locator,
  lastFour: string
) {
  async function trySelect(attempt: number): Promise<boolean> {
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
      return true;
    }
    await bankAccountGroup
      .page()
      .keyboard.press("Escape")
      .catch(() => {
        // Ignore closed dropdown between retries.
      });

    return attempt < 2 ? trySelect(attempt + 1) : false;
  }

  if (await trySelect(0)) {
    return;
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

/**
 * Makes an account the default and waits for the server to confirm it (the
 * toast follows the server result, the badge is only optimistic), so leaving
 * the page can't cut the change off.
 */
async function setDefaultOnServer(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator
): Promise<void> {
  await card.getByRole("button", { name: "Set default" }).click();
  await expect(page.getByText("Default account set")).toBeVisible({
    timeout: 15_000,
  });
  await expect(card.getByText("Default", { exact: true })).toBeVisible();
}

async function deleteDuplicateAccounts(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator,
  duplicateLast4: string,
  seedLast4: string
): Promise<void> {
  const card = accountCard(dialog, duplicateLast4);
  const count = await card.count();
  if (count === 0) {
    return;
  }

  const seedCard = accountCard(dialog, seedLast4).first();
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
    await setDefaultOnServer(page, seedCard);
  }
  await card.first().getByRole("button", { name: "Delete account" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm
    .getByRole("button", { name: "Delete" })
    .click({ timeout: 5000 });
  // The dialog closes once the server has deleted the account, so the next
  // copy of this test (which waits for the lock) never races this one.
  await expect(confirm).toBeHidden({ timeout: 15_000 });
  await expect(card).toHaveCount(count - 1, { timeout: 10_000 });

  await deleteDuplicateAccounts(page, dialog, duplicateLast4, seedLast4);
}

const ROLES_FOR_BANK_ACCOUNT_FLOW = new Set(["super_admin", "volunteer"]);

/** A 10-digit account number unique across parallel copies of this test. */
function uniqueAccountNumber(): string {
  const lastFour = String(randomInt(0, 10_000)).padStart(4, "0");
  // The seeded account ends in 7890; never reuse its last four.
  if (lastFour === "7890") {
    return uniqueAccountNumber();
  }
  return `98${Date.now().toString().slice(-4)}${lastFour}`;
}

async function submitClaim(
  reimbursements: ReimbursementPage,
  label: string
): Promise<void> {
  const title = `E2E Bank ${label} ${Date.now()}`;
  await reimbursements.form.fillTitle(title);
  await reimbursements.form.selectCity("Bangalore");
  await chargeRequestTo(reimbursements.page, "Organisation (admin)");
  await reimbursements.selectExpenseDate();
  await reimbursements.form.fillLineItem({
    amount: "100",
    description: "Test item",
  });
  await reimbursements.form.submit();
  await reimbursements.waitForDetail(title);
}

async function expectPaidTo(
  page: import("@playwright/test").Page,
  accountNumber: string
): Promise<void> {
  await expect(
    page
      .getByRole("region", { name: "Paid to" })
      .getByText(accountNumber, { exact: true })
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("Bank account selection with duplicate names", () => {
  const SEED_LAST4 = "7890";
  const SEED_NUMBER = "1234567890";
  let duplicateLast4 = "";
  let release: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(
      !ROLES_FOR_BANK_ACCOUNT_FLOW.has(testInfo.project.name),
      "Bank account UX covered under super_admin + volunteer projects"
    );
    release = await lockBankAccounts(testInfo);
  });

  test.afterEach(async ({ page }) => {
    try {
      await cleanUpDuplicate(page);
    } finally {
      await release?.();
      release = undefined;
    }
  });

  async function cleanUpDuplicate(page: import("@playwright/test").Page) {
    if (!duplicateLast4) {
      return;
    }

    // Cleanup: delete the duplicate account if it exists
    try {
      // Dismiss any open dialogs first
      await page.keyboard.press("Escape").catch(() => {
        // Ignore — page may have navigated
      });
      await page.waitForTimeout(300);

      const dialog = await navigateToBanking(page);
      await deleteDuplicateAccounts(page, dialog, duplicateLast4, SEED_LAST4);
    } catch {
      // Best-effort cleanup — don't fail the test
    }
  }

  test("selects default account and allows switching between same-named accounts", async ({
    page,
  }) => {
    const duplicateNumber = uniqueAccountNumber();
    duplicateLast4 = duplicateNumber.slice(-4);

    // Step 1: Add a second bank account with the same name via Settings → Bank accounts
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
    await setDefaultOnServer(page, accountCard(dialog, duplicateLast4).first());

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

    // Step 4: The claim is paid to the account the picker showed
    await submitClaim(reimbursements, "default account");
    await expectPaidTo(page, duplicateNumber);

    // Step 5: Switch accounts both ways, then submit on the seeded one
    await reimbursements.navigateToNew();
    await expect(bankAccountGroup.getByRole("combobox")).toContainText(
      duplicateLast4,
      { timeout: 15_000 }
    );
    await selectBankAccountOption(bankAccountGroup, SEED_LAST4);
    await selectBankAccountOption(bankAccountGroup, duplicateLast4);
    await selectBankAccountOption(bankAccountGroup, SEED_LAST4);
    await submitClaim(reimbursements, "switched account");
    await expectPaidTo(page, SEED_NUMBER);
  });
});

test.describe("Reimbursement paid by UPI", () => {
  let upiId = "";
  let release: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(
      !ROLES_FOR_BANK_ACCOUNT_FLOW.has(testInfo.project.name),
      "Bank account UX covered under super_admin + volunteer projects"
    );
    release = await lockBankAccounts(testInfo);
  });

  test.afterEach(async ({ page }) => {
    try {
      if (upiId) {
        const dialog = await navigateToBanking(page);
        const card = dialog
          .locator("[data-slot='settings-list-item']")
          .filter({ hasText: upiId });
        if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
          await card.getByRole("button", { name: "Delete account" }).click();
          const confirm = page.getByRole("alertdialog");
          await confirm.getByRole("button", { name: "Delete" }).click();
          await expect(confirm).toBeHidden({ timeout: 15_000 });
        }
      }
    } catch {
      // Best-effort cleanup — don't fail the test
    } finally {
      upiId = "";
      await release?.();
      release = undefined;
    }
  });

  test("pays a claim to a saved UPI ID with no bank details", async ({
    page,
  }) => {
    upiId = `e2e.${Date.now()}${randomInt(0, 1000)}@okhdfc`;

    const dialog = await navigateToBanking(page);
    await dialog.getByLabel("Account name").fill("E2E UPI payee");
    await dialog.getByLabel("UPI ID or mobile number").fill(upiId);
    await dialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("UPI added")).toBeVisible({ timeout: 15_000 });

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToNew();
    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await selectBankAccountOption(bankAccountGroup, upiId);
    await submitClaim(reimbursements, "UPI");

    const paidTo = page.getByRole("region", { name: "Paid to" });
    await expect(paidTo.getByText(upiId, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(paidTo.getByText("UPI", { exact: true })).toBeVisible();
    await expect(paidTo.getByText("IFSC code")).toHaveCount(0);
    await expect(paidTo.getByText("Account number")).toHaveCount(0);
  });
});
