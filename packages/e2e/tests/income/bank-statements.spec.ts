import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../fixtures/bank/statement-sample.csv"
);

async function fixture<T>(
  script: "bank-statements" | "razorpay",
  action: string,
  arg = ""
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, `../../helpers/${script}.ts`),
      action,
      arg,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface StoredLine {
  amountPaise: number;
  direction: string;
  matchKind: string | null;
  matchStatus: string;
  valueOn: string;
}

const statementCsv = (run: string) =>
  Buffer.from(readFileSync(FIXTURE, "utf8").replaceAll("{RUN}", run), "utf8");

/** The last two lines again (now decided) and one new line after them. */
const overlapCsv = (run: string) =>
  Buffer.from(
    [
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      `18/09/26,UPI/CR/UNKNOWN PAYER ${run},UPIX${run},18/09/26,,"1,234.00","25,209.00"`,
      `19/09/26,NEFT DR-PRINTING ${run},PRINT${run},19/09/26,"1,000.00",,"24,209.00"`,
      `20/09/26,UPI/CR/LATE GIFT ${run},UPIL${run},20/09/26,,300.00,"24,509.00"`,
    ].join("\n"),
    "utf8"
  );

async function importStatement(
  page: Page,
  account: { accountId: string; accountName: string },
  name: string,
  csv: Buffer
) {
  await page.goto(`/income/bank/import?account=${account.accountId}`);
  await waitForZeroReady(page);
  const picker = page.getByRole("combobox", { name: "Bank account" });
  await picker.click();
  await picker.fill(account.accountName);
  await page
    .getByRole("option")
    .filter({ hasText: account.accountName })
    .first()
    .click();
  await page
    .getByTestId("import-file-input")
    .setInputFiles({ buffer: csv, mimeType: "text/csv", name });
  await page.getByRole("button", { name: "Continue" }).click();
  // The rows above the headings are dropped; the value date is the date.
  await expect(page.locator('[data-column="Value Dt"]')).toContainText(
    "Date (value date)"
  );
  await expect(page.locator('[data-column="Withdrawal Amt."]')).toContainText(
    "Withdrawal (debit)"
  );
  await page.getByRole("button", { name: "Continue" }).click();
}

const line = (page: Page, text: string) =>
  page.getByTestId("statement-line").filter({ hasText: text });

test.describe("Income: bank statements", () => {
  test("imports a statement, matches it and skips overlapping lines", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    const run = `${Date.now()}${randomUUID().slice(0, 6)}`.toUpperCase();
    const account = await fixture<{ accountId: string; accountName: string }>(
      "bank-statements",
      "setup",
      run
    );

    await importStatement(page, account, `hdfc-${run}.csv`, statementCsv(run));
    await expect(page.getByTestId("statement-review-summary")).toContainText(
      "5 new lines, 0 already imported"
    );
    await page.getByRole("button", { name: "Import 5 lines" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import lines" })
      .click();
    const result = page.getByTestId("statement-import-result");
    await expect(result).toContainText("5 lines imported");
    // The settlement by its UTR, the UPI gift by its reference.
    await expect(result).toContainText("2 lines matched");
    await expect(result).toContainText("1 line has a suggestion");

    await page.getByRole("link", { name: "Review the lines" }).click();
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Bank statements" })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "To review 2" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: "Money out 1" })).toBeVisible();
    await page.getByRole("tab", { name: "Matched 2" }).click();
    await expect(line(page, `E2EUTR${run}`)).toContainText(
      "Razorpay settlement"
    );
    await expect(line(page, `E2EUTR${run}`)).toContainText("UTR matches");
    await expect(line(page, `UPIREF${run}`)).toContainText(
      "Donation from E2E Income Donor"
    );
    await page.getByRole("tab", { name: /^To review/ }).click();

    // The give.do payout is a suggestion: accept it.
    const payout = line(page, `PAYOUT ${run}`);
    await expect(payout.getByTestId("statement-suggestion")).toContainText(
      "give.do payout"
    );
    await payout.getByRole("button", { exact: true, name: "Match" }).click();
    await expect(payout).toHaveCount(0, { timeout: 15_000 });

    // The unknown credit becomes a donation, matched to its line.
    await line(page, `UNKNOWN PAYER ${run}`)
      .getByRole("button", { name: "Record as donation" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Record donation from bank line",
    });
    await expect(dialog.getByRole("textbox", { name: /Amount/ })).toHaveValue(
      "1234"
    );
    const donor = dialog.getByRole("combobox", { name: "Donor" });
    await donor.click();
    await donor.fill("E2E Income Donor");
    await page
      .getByRole("option")
      .filter({ hasText: "E2E Income Donor" })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Save contribution" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(line(page, `UNKNOWN PAYER ${run}`)).toHaveCount(0, {
      timeout: 15_000,
    });

    await expect(
      page.getByText("All money in is matched or ignored")
    ).toBeVisible({ timeout: 15_000 });

    // The debit waits under Money out. From 1 Apr 2026 it can't be
    // ignored; it is marked as bank charges instead.
    await page.getByRole("tab", { name: /^Money out/ }).click();
    const debit = line(page, `PRINTING ${run}`);
    await debit.getByRole("button", { name: "Line actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Ignore" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Bank charges" }).click();
    const charges = page.getByRole("dialog", { name: "Bank charges" });
    await charges.getByRole("button", { name: "Mark as bank charges" }).click();
    await expect(charges).toBeHidden();
    await expect(
      page.getByText("All money out is matched or explained")
    ).toBeVisible({ timeout: 15_000 });

    const stored = await fixture<StoredLine[]>(
      "bank-statements",
      "lines",
      account.accountId
    );
    expect(stored.map((l) => [l.matchStatus, l.matchKind])).toEqual([
      ["matched", "settlement"],
      ["matched", "contribution"],
      ["matched", "giveindia_payout"],
      ["matched", "contribution"],
      ["matched", "expense"],
    ]);

    // An overlapping statement adds only the line that is new.
    await importStatement(
      page,
      account,
      `hdfc-late-${run}.csv`,
      overlapCsv(run)
    );
    await expect(page.getByTestId("statement-review-summary")).toContainText(
      "1 new line, 2 already imported"
    );
    await page.getByRole("button", { name: "Import 1 line" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import lines" })
      .click();
    await expect(page.getByTestId("statement-import-result")).toContainText(
      "1 line imported"
    );
    const after = await fixture<StoredLine[]>(
      "bank-statements",
      "lines",
      account.accountId
    );
    expect(after).toHaveLength(6);
    expect(after.at(-1)).toMatchObject({
      amountPaise: 30_000,
      matchStatus: "unmatched",
    });
  });

  test("deletes an open line and a whole import, then imports the file again", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    const run = `${Date.now()}${randomUUID().slice(0, 6)}`.toUpperCase();
    const account = await fixture<{ accountId: string; accountName: string }>(
      "bank-statements",
      "account",
      run
    );
    const csv = Buffer.from(
      [
        "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
        `24/09/26,UPI/CR/FIRST STRAY ${run},STRAYA${run},24/09/26,,111.00,`,
        `25/09/26,UPI/CR/SECOND STRAY ${run},STRAYB${run},25/09/26,,222.00,`,
      ].join("\n"),
      "utf8"
    );
    const importBoth = async () => {
      await importStatement(page, account, `stray-${run}.csv`, csv);
      await expect(page.getByTestId("statement-review-summary")).toContainText(
        "2 new lines, 0 already imported"
      );
      await page.getByRole("button", { name: "Import 2 lines" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Import lines" })
        .click();
      await expect(page.getByTestId("statement-import-result")).toContainText(
        "2 lines imported"
      );
    };
    const lineAction = async (text: string, action: string) => {
      await line(page, text)
        .getByRole("button", { name: "Line actions" })
        .click();
      await page.getByRole("menuitem", { name: action }).click();
    };
    await importBoth();
    await page.getByRole("link", { name: "Review the lines" }).click();
    await waitForZeroReady(page);
    await expect(page.getByRole("tab", { name: "To review 2" })).toBeVisible({
      timeout: 15_000,
    });

    await lineAction(`FIRST STRAY ${run}`, "Delete line");
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete line" }).click();
    await expect(page.getByText("Line deleted")).toBeVisible();
    await expect(line(page, `FIRST STRAY ${run}`)).toHaveCount(0, {
      timeout: 15_000,
    });

    // An ignored line holds its import back until it is reopened.
    await lineAction(`SECOND STRAY ${run}`, "Ignore");
    const ignore = page.getByRole("dialog", { name: "Ignore this line?" });
    await ignore.getByRole("button", { name: "Ignore line" }).click();
    await expect(ignore).toBeHidden();
    await page.getByRole("tab", { name: /^Ignored/ }).click();
    await line(page, `SECOND STRAY ${run}`)
      .getByRole("button", { name: "Line actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete line" })
    ).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Delete its import…" }).click();
    await confirm.getByRole("button", { name: "Delete import" }).click();
    await expect(page.getByText("Couldn't delete the import")).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await lineAction(`SECOND STRAY ${run}`, "Stop ignoring");
    await page.getByRole("tab", { name: /^To review/ }).click();
    await lineAction(`SECOND STRAY ${run}`, "Delete its import…");
    await expect(confirm).toContainText("the 1 line it brought in");
    await confirm.getByRole("button", { name: "Delete import" }).click();
    await expect(page.getByText("Import deleted with 1 line")).toBeVisible();
    expect(
      await fixture<StoredLine[]>("bank-statements", "lines", account.accountId)
    ).toEqual([]);

    // The freed hashes let the same file bring both lines back.
    await importBoth();
  });

  test("matches bank debits to claims and vendor payments, splits one, and marks bank charges", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    const run = `${Date.now()}${randomUUID().slice(0, 6)}`.toUpperCase();
    const setup = await fixture<{
      accountId: string;
      accountName: string;
      amounts: { claimA: number; claimB: number; payment: number };
      claimA: string;
      claimB: string;
      paymentId: string;
    }>("bank-statements", "debit-setup", run);
    const rupees = (paise: number) =>
      `"${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}"`;
    const csv = Buffer.from(
      [
        "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
        `21/09/26,NEFT DR-TENT HOUSE VUTR${run},VUTR${run},21/09/26,${rupees(setup.amounts.payment)},,`,
        `22/09/26,IMPS DR-REIMBURSE ${run},IMPS${run},22/09/26,${rupees(setup.amounts.claimA + setup.amounts.claimB)},,`,
        `23/09/26,CHRG SMS ALERTS ${run},,23/09/26,17.70,,`,
      ].join("\n"),
      "utf8"
    );
    await importStatement(page, setup, `debits-${run}.csv`, csv);
    await expect(page.getByTestId("statement-review-summary")).toContainText(
      "3 new lines, 0 already imported"
    );
    await page.getByRole("button", { name: "Import 3 lines" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import lines" })
      .click();
    await expect(page.getByTestId("statement-import-result")).toContainText(
      "3 lines imported"
    );
    await page.getByRole("link", { name: "Review the lines" }).click();
    await waitForZeroReady(page);
    await page.getByRole("tab", { name: /^Money out/ }).click();
    await expect(page.getByRole("tab", { name: "Money out 3" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("debit-reconciliation")).toContainText(
      "0 debits matched · 3 need attention"
    );

    // The vendor payment whose UTR the line carries is suggested first.
    const tent = line(page, `TENT HOUSE VUTR${run}`);
    const suggestion = tent.getByTestId("debit-suggestion");
    await expect(suggestion).toContainText(`E2E tent hire ${run}`, {
      timeout: 15_000,
    });
    await expect(suggestion).toContainText("Reference matches");
    await suggestion.getByRole("button", { name: "Confirm match" }).click();
    await expect(tent).toHaveCount(0, { timeout: 15_000 });

    // One debit paid two claims: picked together in Find match.
    const both = line(page, `REIMBURSE ${run}`);
    await both.getByRole("button", { name: /^Find (other )?match/ }).click();
    const dialog = page.getByRole("dialog", { name: "Find match" });
    await dialog.getByRole("textbox", { name: "Payee or title" }).fill(run);
    await dialog
      .getByTestId("debit-candidate")
      .filter({ hasText: `E2E outing ${run}` })
      .click();
    await dialog
      .getByTestId("debit-candidate")
      .filter({ hasText: `E2E snacks ${run}` })
      .click();
    const total = dialog.getByTestId("debit-selection-total");
    await expect(total).not.toContainText("not explained");
    await dialog.getByRole("button", { name: "Match debit" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(both).toHaveCount(0, { timeout: 15_000 });

    // Money out with no claim behind it: bank charges.
    const sms = line(page, `SMS ALERTS ${run}`);
    await sms.getByRole("button", { name: "Line actions" }).click();
    await page.getByRole("menuitem", { name: "Bank charges" }).click();
    const charges = page.getByRole("dialog", { name: "Bank charges" });
    await charges.getByRole("button", { name: "Mark as bank charges" }).click();
    await expect(charges).toBeHidden();

    await expect(page.getByTestId("debit-reconciliation")).toContainText(
      "All debits are matched",
      { timeout: 15_000 }
    );
    await expect(
      page.getByText("All money out is matched or explained")
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Matched/ }).click();
    await expect(line(page, `REIMBURSE ${run}`)).toContainText(
      `E2E outing ${run}`
    );
    await expect(line(page, `REIMBURSE ${run}`)).toContainText(
      `E2E snacks ${run}`
    );

    const allocations = await fixture<
      {
        amountPaise: number;
        kind: string;
        reimbursementId: string | null;
        vendorPaymentTransactionId: string | null;
      }[]
    >("bank-statements", "debit-allocations", setup.accountId);
    expect(allocations).toEqual([
      {
        amountPaise: 1770,
        kind: "bank_charges",
        reimbursementId: null,
        vendorPaymentTransactionId: null,
      },
      {
        amountPaise: setup.amounts.claimB,
        kind: "reimbursement",
        reimbursementId: setup.claimB,
        vendorPaymentTransactionId: null,
      },
      {
        amountPaise: setup.amounts.claimA,
        kind: "reimbursement",
        reimbursementId: setup.claimA,
        vendorPaymentTransactionId: null,
      },
      {
        amountPaise: setup.amounts.payment,
        kind: "vendor_payment_transaction",
        reimbursementId: null,
        vendorPaymentTransactionId: setup.paymentId,
      },
    ]);

    // The claim says where it was paid from.
    await page.goto(`/reimbursements/${setup.claimA}`);
    await waitForZeroReady(page);
    await expect(page.getByTestId("paid-from-bank")).toContainText(
      `Paid from ${setup.accountName} on 22 Sep 2026`,
      { timeout: 15_000 }
    );
  });
});
