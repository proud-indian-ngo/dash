import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { clickPageAction } from "../../helpers/page-header";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { ListPage } from "../../pages/list-page";

const INCOME_DONOR = "E2E Income Donor";
const ACCOUNT = "E2E Bank Account";

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

async function openRecordDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Record contribution" }).click();
  const dialog = page.getByRole("dialog", { name: "Record contribution" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillGift(
  page: Page,
  dialog: Locator,
  gift: { amount: string; donor?: string; reference: string }
) {
  if (gift.donor) {
    await pickOption(dialog, page, "Donor", gift.donor);
  }
  await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill(gift.amount);
  await pickOption(dialog, page, "Deposited into", ACCOUNT);
  await dialog
    .getByRole("textbox", { exact: true, name: "Reference" })
    .fill(gift.reference);
}

async function searchFor(page: Page, query: string) {
  await page.getByPlaceholder("Search donor or reference...").fill(query);
}

/**
 * The table has no Reference column, so search by the unique reference (the
 * search covers it) and pick the row by text it does show.
 */
async function findRow(page: Page, reference: string, text: string) {
  await searchFor(page, reference);
  return page.getByRole("row").filter({ hasText: text });
}

test.describe("Income: contributions (finance)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await page.goto("/income");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Income" })
    ).toBeVisible();
  });

  test("records, edits and deletes a contribution for an existing donor", async ({
    page,
  }) => {
    test.slow();
    const reference = `E2E-REC-${Date.now()}`;
    const dialog = await openRecordDialog(page);
    await fillGift(page, dialog, {
      amount: "1500",
      donor: INCOME_DONOR,
      reference,
    });
    await clickUntilDialogCloses(dialog, "Save contribution");

    const row = await findRow(page, reference, INCOME_DONOR);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText("₹1,500.00");
    await expect(row).toContainText("UPI");
    await expect(row).toContainText("Manual");

    const list = new ListPage(page);
    await list.openRowActionAndClick(row, "Edit");
    const editDialog = page.getByRole("dialog", { name: "Edit contribution" });
    const amount = editDialog.getByRole("textbox", { name: "Amount (₹)" });
    await expect(amount).toHaveValue("1500", { timeout: 10_000 });
    await amount.fill("1750");
    await clickUntilDialogCloses(editDialog, "Save changes");
    await expect(row).toContainText("₹1,750.00", { timeout: 10_000 });

    await list.openRowActionAndClick(row, "Delete");
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete contribution" }).click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  });

  test("records a contribution for a donor created inline", async ({
    page,
  }) => {
    test.slow();
    const donorName = `E2E Inline Donor ${Date.now()}`;
    const reference = `E2E-INL-${Date.now()}`;
    const dialog = await openRecordDialog(page);

    await dialog.getByRole("button", { name: "New donor" }).click();
    const donorDialog = page.getByRole("dialog", { name: "Add donor" });
    await expect(donorDialog).toBeVisible();
    await donorDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(donorName);
    await clickUntilDialogCloses(donorDialog, "Add donor");

    await expect(dialog.getByRole("combobox", { name: "Donor" })).toHaveValue(
      `${donorName} (Donor)`,
      { timeout: 10_000 }
    );
    await fillGift(page, dialog, { amount: "999", reference });
    await clickUntilDialogCloses(dialog, "Save contribution");

    const row = await findRow(page, reference, donorName);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText("₹999.00");
  });

  test("Save and record another keeps channel, date and account", async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const first = `E2E-BATCH-A-${stamp}`;
    const second = `E2E-BATCH-B-${stamp}`;
    const dialog = await openRecordDialog(page);
    await fillGift(page, dialog, {
      amount: "100",
      donor: INCOME_DONOR,
      reference: first,
    });
    await dialog
      .getByRole("button", { name: "Save and record another" })
      .click();

    // The dialog stays open with the donor, amount and reference cleared.
    await expect(
      dialog.getByRole("textbox", { name: "Amount (₹)" })
    ).toHaveValue("", { timeout: 10_000 });
    await expect(dialog.getByRole("combobox", { name: "Donor" })).toHaveValue(
      ""
    );
    await expect(
      dialog.getByRole("textbox", { exact: true, name: "Reference" })
    ).toHaveValue("");
    await expect(
      dialog.getByRole("combobox", { name: "Deposited into" })
    ).toHaveValue(ACCOUNT);

    await pickOption(dialog, page, "Donor", INCOME_DONOR);
    await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill("200");
    await dialog
      .getByRole("textbox", { exact: true, name: "Reference" })
      .fill(second);
    await clickUntilDialogCloses(dialog, "Save contribution");

    await expect(await findRow(page, first, "₹100.00")).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(await findRow(page, second, "₹200.00")).toHaveCount(1, {
      timeout: 10_000,
    });
  });

  test("filters contributions by channel", async ({ page }) => {
    test.slow();
    const reference = `E2E-CASH-${Date.now()}`;
    const dialog = await openRecordDialog(page);
    await pickOption(dialog, page, "Donor", INCOME_DONOR);
    await dialog.getByLabel("Channel").click();
    await page.getByRole("option", { exact: true, name: "Cash" }).click();
    // Cash defaults the reporting mode to cash.
    await expect(dialog.getByLabel("Reporting mode")).toContainText("Cash");
    await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill("300");
    await pickOption(dialog, page, "Deposited into", ACCOUNT);
    await dialog
      .getByRole("textbox", { exact: true, name: "Reference" })
      .fill(reference);
    await clickUntilDialogCloses(dialog, "Save contribution");

    const cashRow = await findRow(page, reference, "₹300.00");
    await expect(cashRow).toHaveCount(1, { timeout: 10_000 });
    const seedRow = await findRow(page, "E2E-SEED-UTR", "E2E Seed Donor");
    await expect(seedRow).toHaveCount(1, { timeout: 10_000 });

    await applyQuickFilter(page, "Channel", "Cash");
    await expect(seedRow).toHaveCount(0, { timeout: 10_000 });
    await expect(await findRow(page, reference, "₹300.00")).toHaveCount(1);
  });

  test("the channel decides the account and the reporting mode", async ({
    page,
  }) => {
    const dialog = await openRecordDialog(page);
    const mode = dialog.getByLabel("Reporting mode");
    const account = dialog.getByRole("combobox", { name: "Deposited into" });

    // UPI (the default): reported as electronic, into a bank account only.
    await expect(mode).toContainText("Electronic or account-payee cheque");
    await expect(mode).toBeDisabled();
    await account.click();
    await account.fill("E2E");
    await expect(
      page.getByRole("option").filter({ hasText: ACCOUNT }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("option").filter({ hasText: "Clearing" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("option").filter({ hasText: "clearing" })
    ).toHaveCount(0);
    await page.getByRole("option").filter({ hasText: ACCOUNT }).first().click();
    await expect(account).toHaveValue(ACCOUNT);

    // Razorpay: the clearing account is filled in and fixed.
    await dialog.getByLabel("Channel").click();
    await page.getByRole("option", { exact: true, name: "Razorpay" }).click();
    await expect(account).toHaveValue("E2E Razorpay Clearing", {
      timeout: 10_000,
    });
    // The combobox marks itself disabled with data-disabled.
    await expect(account).toHaveAttribute("data-disabled", "");
    await expect(
      dialog.getByText("Razorpay gifts land in the Razorpay clearing account.")
    ).toBeVisible();
    await expect(mode).toBeDisabled();

    // Cheque: a bearer cheque may be reported as other; the clearing
    // account does not fit, so it is cleared.
    await dialog.getByLabel("Channel").click();
    await page.getByRole("option", { exact: true, name: "Cheque" }).click();
    await expect(mode).toBeEnabled();
    await expect(account).not.toHaveAttribute("data-disabled");
    await expect(account).not.toHaveValue("E2E Razorpay Clearing");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("keeps the mode of receipt as the channel changes", async ({ page }) => {
    test.slow();
    const reference = `E2E-MODE-${Date.now()}`;
    const dialog = await openRecordDialog(page);
    const mode = dialog.getByLabel("Reporting mode");
    const chooseChannel = async (name: string) => {
      await dialog.getByLabel("Channel").click();
      await page.getByRole("option", { exact: true, name }).click();
    };
    const expectMode = async (label: string) => {
      await expect(mode).toContainText(label);
      await expect(mode).not.toContainText("Select an option");
      await expect(mode).not.toHaveAttribute("aria-invalid", "true");
      await expect(dialog.getByText("Invalid option")).toHaveCount(0);
    };

    // Open the mode list once while it can change: from then on its items are
    // registered, which is when a channel change used to clear the mode.
    await chooseChannel("Cheque");
    await mode.click();
    await page
      .getByRole("option", {
        exact: true,
        name: "Electronic or account-payee cheque",
      })
      .click();
    for (const [channel, label] of [
      ["NEFT/IMPS", "Electronic or account-payee cheque"],
      ["Cash", "Cash"],
      ["NEFT/IMPS", "Electronic or account-payee cheque"],
      ["Cheque", "Electronic or account-payee cheque"],
      ["In kind", "In kind"],
      ["Cheque", "Electronic or account-payee cheque"],
      ["UPI", "Electronic or account-payee cheque"],
      ["Cash", "Cash"],
      ["Razorpay", "Electronic or account-payee cheque"],
      ["Cash", "Cash"],
      ["NEFT/IMPS", "Electronic or account-payee cheque"],
    ] as const) {
      await chooseChannel(channel);
      await expectMode(label);
    }

    // A Cash gift saves after switching from NEFT, keeping the bank account
    // (cash is deposited to the bank).
    await pickOption(dialog, page, "Donor", INCOME_DONOR);
    await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill("410");
    await pickOption(dialog, page, "Deposited into", ACCOUNT);
    await chooseChannel("Cash");
    await expectMode("Cash");
    await expect(
      dialog.getByRole("combobox", { name: "Deposited into" })
    ).toHaveValue(ACCOUNT);
    await dialog
      .getByRole("textbox", { exact: true, name: "Reference" })
      .fill(reference);
    await clickUntilDialogCloses(dialog, "Save contribution");
    const row = await findRow(page, reference, "₹410.00");
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText("Cash");
  });

  test("counts the seed donor, who has no ID, under Missing donor details", async ({
    page,
  }) => {
    const stat = page.getByRole("button", {
      name: "Show donors missing details for the donations return",
    });
    await expect(stat).toBeVisible({ timeout: 10_000 });
    const value = stat.locator("[data-slot='stat-value']");
    await expect(value).toHaveText(/^[1-9]\d*$/, { timeout: 10_000 });

    // The stat filters the table to this year's received gifts from them.
    await stat.click();
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Seed Donor" })
    ).toHaveCount(1, { timeout: 10_000 });
  });

  test("records other income", async ({ page }) => {
    const description = `E2E interest ${Date.now()}`;
    await clickPageAction(page, "Record other income");
    const dialog = page.getByRole("dialog", { name: "Record other income" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Amount (₹)" }).fill("250.75");
    await pickOption(dialog, page, "Deposited into", ACCOUNT);
    await dialog
      .getByRole("textbox", { name: "Description" })
      .fill(description);
    await clickUntilDialogCloses(dialog, "Record income");

    await expect(
      page.getByRole("tab", { name: "Other income" })
    ).toHaveAttribute("aria-selected", "true");
    const row = page.getByRole("row").filter({ hasText: description });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("Interest");
    await expect(row).toContainText("₹250.75");
  });
});

test.describe("Income: donor giving", () => {
  test("the donor sheet shows giving and links to Income", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await page.goto("/donors");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donors...").fill("E2E Seed Donor");
    const row = page.getByRole("row").filter({ hasText: "E2E Seed Donor" });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await new ListPage(page).openRowActionAndClick(row, "View");

    const giving = page.getByRole("region", { name: "Giving" });
    await expect(giving).toBeVisible({ timeout: 10_000 });
    await expect(giving.getByText("Lifetime")).toBeVisible();
    await expect(giving.getByText("₹12,345.00").first()).toBeVisible();

    await giving.getByRole("link", { name: "View in Income" }).click();
    await expect(page).toHaveURL(/\/income/);
    // Filtered to this donor: their gift shows, other donors' do not.
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Seed Donor" })
    ).toHaveCount(1, { timeout: 10_000 });
    await expect(
      page.getByRole("row").filter({ hasText: INCOME_DONOR })
    ).toHaveCount(0);
  });
});
