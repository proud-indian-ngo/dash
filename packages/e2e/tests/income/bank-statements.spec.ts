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
    await expect(page.getByRole("tab", { name: "To review 3" })).toBeVisible({
      timeout: 15_000,
    });
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

    // The debit is set aside.
    const debit = line(page, `PRINTING ${run}`);
    await expect(debit).toContainText("Expense matching comes with the ledger");
    await debit.getByRole("button", { name: "Line actions" }).click();
    await page.getByRole("menuitem", { name: "Ignore" }).click();
    const ignore = page.getByRole("dialog", { name: "Ignore this line?" });
    await ignore.getByRole("button", { name: "Ignore line" }).click();
    await expect(ignore).toBeHidden();
    await expect(
      page.getByText("All lines are matched or ignored")
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
      ["ignored", null],
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

  test("a role with donors.view only cannot open bank statements", async ({
    baseURL,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    const viewer = await fixture<{ email: string; password: string }>(
      "razorpay",
      "donors-viewer"
    );
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(viewer.email);
      await page.getByLabel("Password").fill(viewer.password);
      await page.getByRole("button", { exact: true, name: "Log in" }).click();
      await page.waitForURL((url) => url.pathname !== "/login");

      await page.goto("/income/bank");
      await expect(page).not.toHaveURL(/\/income\/bank/);
      await page.goto("/income/bank/import");
      await expect(page).not.toHaveURL(/\/income\/bank/);
      await page.goto("/income");
      await waitForZeroReady(page);
      await expect(
        page.getByRole("heading", { exact: true, name: "Income" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "More actions" })
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
